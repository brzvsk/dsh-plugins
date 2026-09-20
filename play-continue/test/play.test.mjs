import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {status,continueTurn,apply} from '../index.mjs';
import {empty,mount,doubleEscape} from '../src/client.mjs';
const end=(kind,turn=3)=>({type:'turn/end',data:{turn,reason:{kind}}});
const store=value=>({getSnapshot:()=>value,subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);},listeners:new Set(),set(next){value=next;for(const fn of this.listeners)fn();}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
test('only latest abnormal turn qualifies, with idle and empty-queue gates',()=>{
  for(const kind of ['aborted','error','interrupted','max-tokens']) assert.equal(status([end(kind)]).eligible,true);
  for(const kind of ['completed','blocked','unknown']) assert.equal(status([end(kind)]).eligible,false);
  assert.equal(status([end('aborted'),end('completed',4)]).eligible,false);
  assert.equal(status([]).eligible,false);
  assert.equal(status([{type:'turn/start',data:{turn:4}}]).reason,'interrupted');
  assert.equal(status([end('aborted')],{status:'running'}).eligible,false);
  assert.equal(status([end('aborted')],{status:'idle',inbox:{nextTurn:[{}],nextStep:[]}}).eligible,false);
  assert.equal(status([end('aborted')],undefined,{origin:'subagent'}).eligible,false);
});
test('cold activation uses native resolver; authoritative recheck prevents stale and duplicate work',async()=>{
  const events=[end('interrupted')];let sent=0;
  const agent={status:'idle',inbox:{nextTurn:[],nextStep:[]},session:{header:{},snapshotEvents:()=>events},followup(message){sent++;assert.equal(message.source.kind,'user');assert.match(message.content[0].text,/Продолжи/);this.status='running';}};
  const ctx={agents:{get:()=>undefined},sessionController:{inspect:async()=>({events,meta:{}}),resolveAgent:async()=>({agent})}};
  await continueTurn(ctx,{sessionId:'a',turn:3,language:'ru'});assert.equal(sent,1);
  await assert.rejects(continueTurn(ctx,{sessionId:'a',turn:3}));assert.equal(sent,1);
  agent.status='idle';await assert.rejects(continueTurn(ctx,{sessionId:'a',turn:2}));
  ctx.sessionController.resolveAgent=async()=>{events.push(end('completed',4));return {agent};};
  await assert.rejects(continueTurn(ctx,{sessionId:'a',turn:3}));assert.equal(sent,1);
});
const idle={openState:'open',running:false,removed:false,subagent:null,queue:[],pendingSubmissions:[]};
const blank={phase:'plain',draft:'',attachmentIds:[]};
test('draft, attachments, pending send, disconnected and busy input all keep native controls',()=>{
  assert.equal(empty(blank,idle),true);
  for(const input of [{...blank,draft:'text'},{...blank,attachmentIds:['image']},{...blank,phase:'submitting'}]) assert.equal(empty(input,idle),false);
  for(const session of [{...idle,running:true},{...idle,openState:'loading'},{...idle,pendingSubmissions:[{}]}]) assert.equal(empty(blank,session),false);
});
test('Play occupies Send position, preserves draft, rejects double clicks, restores on typing and disposal',async()=>{
  const dom=new JSDOM('<head><style data-plugin-css="host/InputBar.module.css">.native_primary{display:grid}</style></head><body><div data-composer-card><span id="anchor"></span><div><button class="native_primary" disabled>Send</button></div></div></body>');
  const doc=dom.window.document;const original=doc.querySelector('button');
  const state=store(blank),session=store(idle);let sends=0,complete;
  const off=mount(doc.querySelector('#anchor'),{sessionId:'a',input:{state,notify:()=>{}},session,language:()=> 'ru',fetcher:async(url,options)=>{
    if(options.method==='POST'){sends++;return new Promise(resolve=>{complete=()=>resolve({ok:true,json:async()=>({accepted:true})});});}
    return {ok:true,json:async()=>({eligible:true,turn:3})};
  }});
  await tick();let play=doc.querySelector('[data-play-continue]');assert.ok(play);assert.equal(original.style.display,'none');assert.equal(play.previousElementSibling,original);
  state.set({...blank,draft:'hello'});assert.equal(doc.querySelector('[data-play-continue]'),null);assert.equal(original.style.display,'');
  state.set(blank);play=doc.querySelector('[data-play-continue]');play.click();play.click();assert.equal(sends,1);
  state.set({...blank,draft:'keep me'});complete();await tick();assert.equal(state.getSnapshot().draft,'keep me');
  off();assert.equal(original.style.display,'');assert.equal(doc.querySelector('[data-play-continue]'),null);dom.window.close();
});
test('HTTP route rejects cross-origin continuation before resolving a session',async()=>{
  let route;apply({effect:fn=>fn(),webServer:{register:r=>{route=r;}},agents:{},sessionController:{}});
  let code;await route.handler({headers:{'sec-fetch-site':'cross-site'},method:'POST'},{writeHead:c=>{code=c;},end:()=>{}});assert.equal(code,403);
});

test('double Escape: interval, repeats, consumed keys, pending stop and teardown', async()=>{
 const dom=new JSDOM('');const win=dom.window;let time=0,calls=0,allowed=true,finish;
 const off=doubleEscape(win,{now:()=>time,canStop:()=>allowed,stop:()=>{calls++;return new Promise(r=>{finish=r;});},onError:()=>{}});
 const key=(options={})=>{const e=new win.KeyboardEvent('keydown',{key:'Escape',cancelable:true,...options});win.dispatchEvent(e);return e;};
 key();time=50;key({repeat:true});assert.equal(calls,0);
 time=401;key();assert.equal(calls,0);time=600;assert.equal(key().defaultPrevented,true);assert.equal(calls,1);
 key();key();assert.equal(calls,1);finish({ok:true});await tick();
 allowed=false;key();allowed=true;time=700;key();assert.equal(calls,1);
 const consumed=new win.KeyboardEvent('keydown',{key:'Escape',cancelable:true});consumed.preventDefault();win.dispatchEvent(consumed);
 time=710;key();assert.equal(calls,1);
 win.dispatchEvent(new win.Event('blur'));time=720;key();assert.equal(calls,1);
 off();time=730;key();assert.equal(calls,1);dom.window.close();
});
test('double Escape reports cancellation failure',async()=>{
 const dom=new JSDOM('');let error;
 const off=doubleEscape(dom.window,{canStop:()=>true,stop:async()=>({ok:false,error:{message:'offline'}}),onError:value=>{error=value;},now:()=>100});
 for(let n=0;n<2;n++)dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));
 await tick();assert.equal(error,'offline');off();dom.window.close();
});
