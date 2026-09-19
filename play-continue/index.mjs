import {randomUUID} from 'node:crypto';
export const name = 'play-continue';
export const inject = ['agents', 'sessionController', 'webServer'];
const reasons = new Set(['aborted', 'error', 'interrupted', 'max-tokens']);
export function status(events, agent, meta) {
  if (meta?.origin === 'subagent' || meta?.parentSessionId || agent?.status === 'running' ||
      agent?.inbox.nextTurn.length || agent?.inbox.nextStep.length) return {eligible:false};
  // Only the last turn boundary counts: never revive an older interrupted turn.
  const last = events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end');
  if (!last || (last.type === 'turn/end' && !reasons.has(last.data.reason.kind))) return {eligible:false};
  return {eligible:true, turn:last.data.turn, reason:last.type === 'turn/start' ? 'interrupted' : last.data.reason.kind};
}
export const prompts = {
  en:'Continue the unfinished task from where it stopped. Check the current state before repeating any action whose outcome is uncertain.',
  ru:'Продолжи незавершённую задачу с места остановки. Прежде чем повторять действие с неизвестным результатом, проверь текущее состояние.',
  zh:'从停止的位置继续未完成的任务。对于结果未知的操作，请先检查当前状态再决定是否重复。',
};
export async function current(ctx, sessionId) {
  const agent = ctx.agents.get(sessionId);
  const inspection = agent ? {events:agent.session.snapshotEvents(), meta:agent.session.header} : await ctx.sessionController.inspect(sessionId);
  return status(inspection.events, agent, inspection.meta);
}
export async function continueTurn(ctx, {sessionId, turn, language}) {
  const before = await current(ctx, sessionId);
  if (!before.eligible || before.turn !== turn) throw new Error('This turn can no longer be continued.');
  const resolved = await ctx.sessionController.resolveAgent(sessionId);
  if (resolved.error) throw new Error(resolved.error.message ?? 'Cannot reopen this session.');
  const agent = resolved.agent;
  const checked = status(agent.session.snapshotEvents(), agent, agent.session.header);
  if (!checked.eligible || checked.turn !== turn) throw new Error('The session changed or is already running.');
  // No await between authoritative validation and synchronous driver wakeup.
  agent.followup({id:randomUUID(), role:'user', source:{kind:'user'}, content:[{type:'text',text:prompts[language] ?? prompts.en}]});
  return {accepted:true};
}
export function apply(ctx) {
  const pending = new Set();
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/play-continue',handler:async(req,res)=>{
    const reply = (code,value) => {res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    const site = req.headers['sec-fetch-site'];
    if ((site && site !== 'same-origin' && site !== 'none') ||
        (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host)) return reply(403,{error:'Cross-origin request refused.'});
    let locked;
    try {
      if (req.method === 'GET') {
        const id = new URL(req.url,'http://localhost').searchParams.get('sessionId');
        if (!id || id.length > 256) return reply(400,{error:'Invalid session id.'});
        return reply(200,await current(ctx,id));
      }
      if (req.method !== 'POST') return reply(405,{error:'Method not allowed.'});
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(415,{error:'JSON required.'});
      let body = '';
      for await (const chunk of req) {body += chunk; if (Buffer.byteLength(body) > 4096) return reply(413,{error:'Request too large.'});}
      const value = JSON.parse(body);
      if (!value || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 256 || !Number.isSafeInteger(value.turn) || value.turn < 0) return reply(400,{error:'Invalid continuation target.'});
      if (pending.has(value.sessionId)) return reply(409,{error:'Continuation already pending.'});
      pending.add(value.sessionId); locked = value.sessionId;
      reply(200,await continueTurn(ctx,value));
    } catch(error) {reply(409,{error:error.message ?? 'Continuation failed.'});}
    finally {if(locked) pending.delete(locked);}
  }}),'play-continue: route');
}
