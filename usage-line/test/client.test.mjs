import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {display, scopeIds, mount} from '../src/client.mjs';

const summary = {scope: 'session', sessionIds: ['a'], totalCost: 3.64, usdExchangeRate: 7, unpricedModels: [], byModel: [{model:'deepseek-v4.1-flash',cost:3.64}]};
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

 test('native button styles and cost breakdown dialog; Escape and outside dismissal', async () => {
  const dom = new JSDOM('<head><style data-plugin-css="host/stat-dialog.module.css">.native_panel{padding:16px}</style></head><body><main><div data-composer-stats><span><button class="native_pill">Tokens</button></span></div><span id="anchor"></span></main></body>');
  const doc = dom.window.document;
  const stop = mount(doc.querySelector('#anchor'), {sessionId:'a',rows:()=>({}),language:()=> 'en',fetcher:async()=>({ok:true,json:async()=>summary})});
  await tick(); const pill = doc.querySelector('[data-usage-line]');
  assert.equal(pill.tagName,'BUTTON'); assert.equal(pill.className,'native_pill');
  assert.equal(pill.style.color,''); assert.ok(pill.querySelector('svg'));
  pill.click();
  const panel = doc.querySelector('[role=dialog]');
  assert.equal(panel.className,'native_panel'); assert.match(panel.textContent,/deepseek-v4.1-flash/); assert.match(panel.textContent,/0.5200/);
  assert.equal(pill.getAttribute('aria-expanded'),'true');
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(doc.querySelector('[role=dialog]'),null);
  pill.click(); doc.body.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));
  assert.equal(doc.querySelector('[role=dialog]'),null);
  stop(); dom.window.close();
});
