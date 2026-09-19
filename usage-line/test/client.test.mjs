import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {display, scopeIds, mount} from '../src/client.mjs';

const summary = {scope: 'session', sessionIds: ['a'], totalCost: 3.64, usdExchangeRate: 7, unpricedModels: []};
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
test('USD conversion, sub-cent amounts, unknown pricing and invalid exchange rates', () => {
  assert.equal(display(summary).text, '≈ $0.52');
  assert.equal(display({...summary, totalCost: .001}).text, '≈ <$0.01');
  assert.match(display({...summary, unpricedModels: ['local']}, 'ru').title, /Не учтены.*local/);
  assert.throws(() => display({...summary, usdExchangeRate: 0}));
});
test('only descendants marked as subagents are included, with cycle protection', () => {
  assert.deepEqual(scopeIds({a: {origin:'subagent',parentId:'b'}, b:{origin:'subagent',parentId:'a'}, fork:{parentId:'a',origin:'fork'}, c:{origin:'subagent',parentId:'b'}}, 'a'), ['a','b','c']);
});
test('late stats row, host re-render, no duplicates, same-origin session query and cleanup', async () => {
  const dom = new JSDOM('<main><section id="composer"><div id="card"></div><span id="anchor"></span></section></main>');
  const doc = dom.window.document;
  const stop = mount(doc.querySelector('#anchor'), {sessionId:'a', rows:()=>({}), language:()=> 'en', fetcher: async (url, options) => {
    assert.equal(new URL(url,'http://test').searchParams.get('sessionId'),'a');
    assert.equal(options.credentials, 'same-origin');
    return {ok:true, json:async()=>summary};
  }});
  await tick();
  const row = doc.createElement('div'); row.dataset.composerStats = ''; row.innerHTML = '<button class="native-pill">104M tok</button>';
  doc.querySelector('#composer').append(row);
  await tick();
  assert.equal(row.querySelector('[data-usage-line]').textContent, '≈ $0.52');
  row.innerHTML = '<button class="native-pill">105M tok</button>';
  await tick();
  assert.equal(row.querySelectorAll('[data-usage-line]').length, 1);
  assert.equal(row.querySelector('button').textContent, '105M tok');
  stop(); assert.equal(doc.querySelector('[data-usage-line]'), null);
  dom.window.close();
});
test('late response after unmount cannot paint another session', async () => {
  const dom = new JSDOM('<main><div data-composer-stats></div><span id="anchor"></span></main>');
  let finish;
  const stop = mount(dom.window.document.querySelector('#anchor'), {sessionId:'a',rows:()=>({}),language:()=> 'en',fetcher:()=>new Promise(resolve=>{finish=resolve;})});
  stop(); finish({ok:true,json:async()=>summary}); await tick();
  assert.equal(dom.window.document.querySelector('[data-usage-line]'),null);
  dom.window.close();
});
test('wrong session and failed requests never display a zero or previous cost', async () => {
  const dom = new JSDOM('<main><div data-composer-stats></div><span id="anchor"></span></main>');
  const stop = mount(dom.window.document.querySelector('#anchor'), {sessionId:'b',rows:()=>({}),language:()=> 'ru',fetcher:async()=>({ok:true,json:async()=>summary})});
  await tick();
  assert.equal(dom.window.document.querySelector('[data-usage-line]').textContent,'≈ $—');
  stop(); dom.window.close();
});
