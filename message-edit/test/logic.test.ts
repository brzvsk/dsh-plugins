import assert from 'node:assert'
import { foldTurns, planOperation } from '../src/host.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

function ev(type: string, data: unknown, seq: number): SessionEvent {
  return { type, seq, time: seq * 1000, data } as SessionEvent
}

function userEvent(seq: number, text: string): SessionEvent {
  return ev('user/message', {
    id: 'u-' + seq, role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }, seq)
}

function assistantEvent(seq: number, turn: number, text: string): SessionEvent {
  return ev('assistant/message', {
    turn, step: 1,
    message: {
      id: 'a-' + seq, role: 'assistant',
      content: [{ type: 'text', text }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
  }, seq)
}

// Scenario: one closed turn (seqs 0..3), then an open tail turn (seqs 4..5, no turn/end).
const events: SessionEvent[] = [
  ev('turn/start', { turn: 1 }, 0),
  userEvent(1, 'first question'),
  assistantEvent(2, 1, 'first answer'),
  ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 3),
  ev('turn/start', { turn: 2 }, 4),
  userEvent(5, 'second question (in flight)'),
]

const folded = foldTurns(events)
assert.strictEqual(folded.closed.length, 1, 'one closed turn')
assert.strictEqual(folded.closed[0]?.turn, 1)
assert.ok(folded.open, 'open tail present')
assert.strictEqual(folded.open?.turn, 2)
assert.strictEqual(folded.open?.user?.seq, 5)
console.log('foldTurns: OK  closed=1 openTurn=2 openUserSeq=5')

// 1) edit the OPEN tail user message -> boundary = turn2.startSeq - 1 = 3, truncate, edited text queued
const openPlan = planOperation({
  action: 'edit', sessionId: 's-src', eventSeq: 5, blockIndex: 0, text: 'EDITED second question', cascade: 'truncate',
}, events)
assert.strictEqual(openPlan.boundary, 3, 'open-tail edit boundary is before turn 2')
assert.strictEqual(openPlan.queuedUsers.length, 1, 'open-tail edit queues exactly the edited message')
assert.ok(openPlan.queuedUsers[0]?.content[0] && (openPlan.queuedUsers[0].content[0] as { text?: string }).text === 'EDITED second question')
// Last closed turn remains editable; stale earlier targets are rejected.
const edit = (eventSeq: number, text = 'edited', blockIndex = 0) => ({ action: 'edit' as const, sessionId: 's-src', eventSeq, blockIndex, text, cascade: 'truncate' as const })
assert.throws(() => planOperation(edit(1), events), /last message changed/)
const closedPlan = planOperation(edit(1), events.slice(0, 4))
assert.strictEqual(closedPlan.boundary, -1)
assert.throws(() => planOperation(edit(5, '  '), events), /empty/)
assert.throws(() => planOperation(edit(5, 'x', 9), events), /Only user text/)
assert.throws(() => planOperation({ ...edit(5), action: 'retry' } as any, events), /Only last-message/)
const withAttachment = structuredClone(events)
;(withAttachment[5]!.data as any).content.push({ type: 'image', data: 'fixture', mimeType: 'image/png' })
const attachmentPlan = planOperation(edit(5), withAttachment)
assert.deepStrictEqual(attachmentPlan.queuedUsers[0]!.content[1], (withAttachment[5]!.data as any).content[1])
assert.notStrictEqual(attachmentPlan.queuedUsers[0]!.content[1], (withAttachment[5]!.data as any).content[1])
console.log('Last-message boundaries, stale targets, empty text and attachments: OK')
