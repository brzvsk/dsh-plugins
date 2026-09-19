/** Last-user-message editing through native session forks; no version store. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions, AgentSetup } from '@deepseek-ai/dsh-agent'
import type { SessionId, Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-query'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import { EDIT_RESEND_PATH, type CascadePolicy, type EditableMessageBlock, type EditResendOperation, type EditResendOperationResult, type EditResendTimeline } from './shared.ts'

// ── HTTP server surface (rc.5 dsh-host-webserver contract) ──────────────────
interface HttpRequestLike {
  method?: string
  url?: string
  on(event: 'data', listener: (chunk: Uint8Array | string) => void): this
  on(event: 'end', listener: () => void): this
  on(event: 'error', listener: (error: unknown) => void): this
}

interface HttpResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): void
}

interface HttpServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: HttpRequestLike, response: HttpResponseLike) => void | Promise<void>
  }): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: HttpServerLike
  }
}

/** Stable Cordis plugin name. */
export const name = 'edit-resend'

/** Public services used by the edit transaction and last-message projection. */
export const inject = ['sessions', 'agents', 'sessionQuery', 'workspaceRegistry', 'webServer']

type UserEvent = SessionEvent<'user/message'>
type AssistantEvent = SessionEvent<'assistant/message'>

interface ClosedTurn {
  turn: number
  startSeq: number
  endSeq: number
  user?: UserEvent
  assistants: AssistantEvent[]
}

interface OpenTail {
  turn: number
  startSeq: number
  user?: UserEvent
  assistants: AssistantEvent[]
}

interface OperationPlan { boundary: number; queuedUsers: UserMessage[] }

function isTextualBlock(block: ContentBlock | undefined): block is Extract<ContentBlock, { type: 'text' | 'reasoning' }> {
  return block?.type === 'text' || block?.type === 'reasoning'
}

function cloneUser(message: UserMessage, content: ContentBlock[] = structuredClone(message.content)): UserMessage {
  return Object.freeze({
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: Object.freeze(content),
    source: Object.freeze({ kind: 'user' as const }),
  }) as UserMessage
}

function replaceTextBlock(content: readonly ContentBlock[], blockIndex: number, text: string): ContentBlock[] {
  const block = content[blockIndex]
  if (!isTextualBlock(block)) throw new Error('所选内容块不是可编辑文本。')
  return content.map((candidate, index) => index === blockIndex
    ? { ...candidate, text } as ContentBlock
    : structuredClone(candidate))
}

/** Fold complete turn brackets plus the optional still-open tail turn. */
export function foldTurns(events: readonly SessionEvent[]): { closed: ClosedTurn[]; open?: OpenTail } {
  const closed: ClosedTurn[] = []
  let current: Omit<ClosedTurn, 'endSeq'> | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      if (current !== undefined) {
        // Unbalanced previous turn (should not happen for closed folding, but guard).
      }
      current = { turn: event.data.turn, startSeq: event.seq, assistants: [] }
      continue
    }
    if (current === undefined) continue
    if (event.type === 'user/message' && current.user === undefined && event.data.source.kind === 'user') {
      current.user = event
      continue
    }
    if (event.type === 'assistant/message' && event.data.turn === current.turn) {
      current.assistants.push(event)
      continue
    }
    if (event.type === 'turn/end' && event.data.turn === current.turn) {
      closed.push({ ...current, endSeq: event.seq })
      current = undefined
    }
  }
  if (current !== undefined && (current.user !== undefined || current.assistants.length > 0)) {
    return { closed, open: { ...current } }
  }
  return { closed }
}

function editableMessages(closed: readonly ClosedTurn[], open?: OpenTail): EditableMessageBlock[] {
  const result: EditableMessageBlock[] = []
  const pushUser = (event: UserEvent, turnNumber: number, openFlag: boolean): void => {
    for (const [blockIndex, block] of event.data.content.entries()) {
      if (block.type !== 'text') continue
      result.push({
        key: String(event.seq) + ':' + String(blockIndex),
        turn: turnNumber,
        eventSeq: event.seq,
        blockIndex,
        kind: 'user',
        text: block.text,
        time: event.time,
        ...(openFlag ? { open: true } : {}),
      })
    }
  }
  for (const turn of closed) {
    if (turn.user !== undefined) pushUser(turn.user, turn.turn, false)
  }
  if (open !== undefined) {
    if (open.user !== undefined) pushUser(open.user, open.turn, true)
  }
  return result
}

/** Reject stale targets on the server, not merely by hiding their buttons. */
export function planOperation(operation: EditResendOperation, events: readonly SessionEvent[]): OperationPlan {
  if (operation.action !== 'edit' || operation.cascade !== 'truncate') throw new TypeError('Only last-message editing is supported.')
  const { closed, open } = foldTurns(events)
  const latest = [...closed, ...(open ? [open] : [])].findLast(turn => turn.user !== undefined)
  if (!latest?.user || latest.user.seq !== operation.eventSeq) throw new TypeError('The last message changed. Reopen the editor.')
  if (!operation.text.trim()) throw new TypeError('Message cannot be empty.')
  if (latest.user.data.content[operation.blockIndex]?.type !== 'text') throw new TypeError('Only user text can be edited.')
  return { boundary: latest.startSeq - 1, queuedUsers: [cloneUser(latest.user.data, replaceTextBlock(latest.user.data.content, operation.blockIndex, operation.text))] }
}

/** Public read lease supports both live and persisted seeded sessions. */
export async function readEvents(ctx: Context, sessionId: SessionId): Promise<SessionEvent[]> {
  const observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'none' })
  try { return structuredClone([...observation.events]) }
  finally { observation[Symbol.dispose]() }
}

function agentOptions(events: readonly SessionEvent[], fallback?: AgentOptions): AgentOptions {
  const config = events.findLast(event => event.type === 'request/header')?.data.header.config
  const provider = config?.provider ?? fallback?.provider
  const model = config?.model ?? fallback?.model
  if (provider === undefined || provider.length === 0 || model === undefined || model.length === 0) {
    throw new Error('无法从会话历史解析模型路由。')
  }
  const maxTokens = config?.maxTokens ?? fallback?.maxTokens
  return { provider, model, ...(maxTokens === undefined ? {} : { maxTokens }) }
}

async function withSourceAgent<T>(
  ctx: Context, sessionId: SessionId, operation: EditResendOperation, job: (agent: Agent) => Promise<T>,
): Promise<T> {
  let handle: AgentHandle | undefined
  let agent = ctx.agents.get(sessionId)
  if (agent === undefined) {
    const events = await readEvents(ctx, sessionId)
    handle = await ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: agentOptions(events),
    })
    agent = handle.agent
  }
  try {
    planOperation(operation, agent.session.snapshotEvents())
    if (agent.status === 'idle') {
      return await agent.runMaintenance(async () => job(agent))
    }
    // Everything after the edited input is discarded; settle the driver first.
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()
    return await agent.runMaintenance(async () => job(agent))
  } finally {
    await handle?.dispose()
  }
}

function inheritedSeed(source: Session, boundary: number): SessionEvent[] {
  if (boundary === -1) return []
  const events = source.snapshotEvents()
  const boundaryEvent = events[boundary]
  if (boundary < 0 || boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
    throw new Error('分支边界不是连续会话事件。')
  }
  return events.slice(0, boundary + 1)
}

function sessionPreset(session: Session): string | undefined {
  const header = session.header as unknown as { agentPreset?: string }
  if (header.agentPreset !== undefined) return header.agentPreset
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as unknown as { type?: string; data?: { agentPreset?: string } } | undefined
    if (event?.type === 'agent-preset/selected' && event.data?.agentPreset !== undefined) {
      return event.data.agentPreset
    }
  }
  return undefined
}

interface AgentPresetService {
  resolve(presetId: string): Promise<{ id: string }>
  mount(agentCtx: Context, presetId: string): Promise<void>
}

async function createVersionAgent(
  ctx: Context, source: Session, childId: SessionId, plan: OperationPlan, options: AgentOptions,
): Promise<AgentHandle> {
  const events = inheritedSeed(source, plan.boundary)
  const presets = ctx.get('agentPresets') as AgentPresetService | undefined
  const presetId = sessionPreset(source)
  let agentPreset: string | undefined
  let setup: AgentSetup | undefined
  if (presets !== undefined && presetId !== undefined) {
    const resolved = (await presets.resolve(presetId)).id
    agentPreset = resolved
    setup = async (agentCtx) => { await presets.mount(agentCtx, resolved) }
  }
  const child = await ctx.agents.create({
    sessionId: childId,
    seed: events,
    inheritedEventCount: SessionLogOffset(events.length),
    meta: {
      ...(source.header.cwd === undefined ? {} : { cwd: source.header.cwd }),
      parentSession: source.id,
      isSeeded: true,
      ...(agentPreset === undefined ? {} : { agentPreset }),
    },
    agentOptions: options,
    ...(setup === undefined ? {} : { setup }),
  })
  try {
    await ctx.sessions.flush(child.agent.session)
    return child
  } catch (error: unknown) {
    await child.dispose()
    throw error
  }
}

function sourceWorkspace(ctx: Context, sessionId: SessionId): Workspace | undefined {
  return ctx.workspaceRegistry.list().find(workspace => workspace.sessionIds.includes(sessionId))
}

type OperationInverse = () => void | Promise<void>

async function recoverOperation(inverses: OperationInverse[]): Promise<void> {
  const failures: unknown[] = []
  for (const inverse of inverses.reverse()) {
    try {
      await inverse()
    } catch (error: unknown) {
      failures.push(error)
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, '版本操作恢复失败。')
}

interface SessionTitleService {
  rename(session: Session, title: string): unknown
}

/** Best-effort: carry the source session's title over to the new version. */
async function inheritTitle(ctx: Context, sourceId: SessionId, childSession: Session): Promise<void> {
  const sessionTitle = ctx.get('sessionTitle') as unknown as SessionTitleService | undefined
  if (sessionTitle === undefined) return
  const snapshot = await ctx.sessionQuery.readTitle(sourceId) as unknown as { title?: string | null } | undefined
  if (snapshot?.title != null && snapshot.title.trim().length > 0) {
    sessionTitle.rename(childSession, snapshot.title)
  }
}

async function runOperation(ctx: Context, operation: EditResendOperation): Promise<EditResendOperationResult> {
  const sourceId = sessionIdOf(operation.sessionId)
  return withSourceAgent(ctx, sourceId, operation, async (source) => {
    const childId = sessionIdOf('session-' + crypto.randomUUID())
    const inverses: OperationInverse[] = []
    try {
      const events = source.session.snapshotEvents()
      const plan = planOperation(operation, events)
      const options = agentOptions(events, source.options)
      const child = await createVersionAgent(ctx, source.session, childId, plan, options)
      inverses.push(() => child.dispose())

      // Session V3 (0.1.5): the constructor seed replays the source's durable
      // `agent/inbox/spliced` events, so the child inherits whatever the source
      // still had pending at the edit boundary — the very message being edited,
      // plus any queued turns. Left in place, the driver runs that stale input
      // first and the edited message only sits in the queue behind it. Drop the
      // inherited input before queueing the edited turn(s); the splices are
      // durable, so the child's own log records the cancellation.
      child.agent.inbox.clear()

      const workspace = sourceWorkspace(ctx, sourceId)
      if (workspace !== undefined) {
        await workspace.attachSession(childId)
        inverses.push(() => workspace.detachSession(childId))
      }
      for (const message of plan.queuedUsers) child.agent.followup(message)

      inverses.length = 0
      return { sessionId: childId, queuedTurns: plan.queuedUsers.length }
    } catch (error: unknown) {
      try {
        await recoverOperation(inverses)
      } catch (recoveryError: unknown) {
        throw new AggregateError([error, recoveryError], '版本操作及其恢复均失败。')
      }
      throw error
    }
  })
}

/**
 * Post-edit finalization, run OFF the request's critical path: inherit the
 * source title and archive (soft-delete) the previous version so the sidebar
 * keeps a single conversation. Fire-and-forget; failures only warn.
 */
async function finalizeEdit(ctx: Context, sourceId: SessionId, childId: SessionId): Promise<void> {
  try {
    const childSession = ctx.agents.get(childId)?.session
    if (childSession !== undefined) await inheritTitle(ctx, sourceId, childSession)
  } catch (error: unknown) {
    ctx.logger.warn('edit-resend: inherit title failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  try {
    await ctx.workspaceRegistry.archiveSession(sourceId)
  } catch (error: unknown) {
    ctx.logger.warn('edit-resend: archive source failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function timeline(ctx: Context, sessionId: SessionId): Promise<EditResendTimeline> {
  const events = ctx.agents.get(sessionId)?.session.snapshotEvents() ?? await readEvents(ctx, sessionId)
  const { closed, open } = foldTurns(events)
  const users = editableMessages(closed, open).filter(message => message.kind === 'user')
  const latestSeq = events.findLast(event => event.type === 'user/message' && event.data.source.kind === 'user')?.seq
  return { sessionId, messages: users.filter(message => message.eventSeq === latestSeq) }
}

// ── Route decoding / encoding ────────────────────────────────────────────────
function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('请求体必须是 JSON 对象。')
  }
  return value as Record<string, unknown>
}

function sessionIdOf(value: unknown): SessionId {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('sessionId 必须是非空字符串。')
  return value as SessionId
}

function integerOf(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(name + ' 必须是非负安全整数。')
  return value as number
}

function cascadeOf(value: unknown): CascadePolicy {
  if (value !== 'truncate') throw new TypeError('cascade 必须是 truncate 或 preserve。')
  return value
}

function decodeOperation(value: unknown): EditResendOperation {
  const record = objectValue(value)
  const sessionId = sessionIdOf(record['sessionId'])
  switch (record['action']) {
    case 'edit':
      if (typeof record['text'] !== 'string') throw new TypeError('text 必须是字符串。')
      return {
        action: 'edit',
        sessionId,
        eventSeq: integerOf(record['eventSeq'], 'eventSeq'),
        blockIndex: integerOf(record['blockIndex'], 'blockIndex'),
        text: record['text'],
        cascade: cascadeOf(record['cascade']),
      }
    default:
      throw new TypeError('action 必须是 edit、reroll 或 retry。')
  }
}

function requestJson(request: HttpRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder()
    let text = ''
    request.on('data', (chunk) => {
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    })
    request.on('end', () => {
      try {
        text += decoder.decode()
        resolve(JSON.parse(text) as unknown)
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function respondJson(response: HttpResponseLike, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

async function handleRoute(ctx: Context, request: HttpRequestLike, response: HttpResponseLike): Promise<void> {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url ?? EDIT_RESEND_PATH, 'http://edit-resend.local')
      const sessionId = sessionIdOf(url.searchParams.get('sessionId'))
      respondJson(response, 200, await timeline(ctx, sessionId))
      return
    }
    if (request.method === 'POST') {
      const operation = decodeOperation(await requestJson(request))
      const result = await runOperation(ctx, operation)
      // Defer title-inherit + archive so the edit returns to the client quickly.
      void finalizeEdit(ctx, sessionIdOf(operation.sessionId), sessionIdOf(result.sessionId))
      respondJson(response, 200, result)
      return
    }
    response.writeHead(405)
    response.end()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    respondJson(response, error instanceof TypeError ? 400 : 409, { error: message })
  }
}

/** Register the reversible route contribution. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: EDIT_RESEND_PATH,
    handler: (request, response) => handleRoute(ctx, request, response),
  }), 'edit-resend: HTTP route')
}
