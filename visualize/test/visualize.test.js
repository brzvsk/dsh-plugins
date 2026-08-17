import test from 'node:test'
import assert from 'node:assert/strict'
import { validateConfig, formatSummary, createVisualizeDefinition, buildVisualizeSteerMessage, DEFAULT_MAX_PREVIEW_BYTES } from '../lib/index.mjs'

function fakeFs({ html = '<h1>hi</h1>', size, absent = false, notFile = false, chunkSize = 4 }) {
  const emitLog = []
  const fs = {
    async resolve(path) {
      return { targetKey: 't1', displayPath: path.startsWith('/') ? path : `/ws/${path}` }
    },
    async stat() {
      if (absent) return undefined
      if (notFile) return { version: 'v1', type: 'directory', size: size ?? 0 }
      return { version: 'v1', type: 'file', size: size ?? html.length }
    },
    async readText() {
      return html
    },
    // Real dsh-fs contract: streamText returns a PROMISE of an async iterable.
    streamText() {
      return Promise.resolve(
        (async function* () {
          for (let i = 0; i < html.length; i += chunkSize) yield html.slice(i, i + chunkSize)
        })(),
      )
    },
  }
  const ctx = {
    fs,
    emit(event, ...args) {
      emitLog.push([event, ...args])
    },
  }
  return { ctx, emitLog }
}

const exec = () => ({ agent: undefined, signal: new AbortController().signal })

test('validateConfig: defaults and validation', () => {
  assert.deepEqual(validateConfig({}), { maxPreviewBytes: DEFAULT_MAX_PREVIEW_BYTES })
  assert.deepEqual(validateConfig({ maxPreviewBytes: 1024 }), { maxPreviewBytes: 1024 })
  assert.throws(() => validateConfig({ maxPreviewBytes: 0 }))
  assert.throws(() => validateConfig({ maxPreviewBytes: -1 }))
  assert.throws(() => validateConfig({ maxPreviewBytes: 1.5 }))
  assert.throws(() => validateConfig({ maxPreviewBytes: NaN }))
  assert.throws(() => validateConfig({ unknownKey: 1 }))
})

test('execute: reads a small file; meta carries the html; fs/observed emitted', async () => {
  const { ctx, emitLog } = fakeFs({ html: '<h1>hi</h1>' })
  const def = createVisualizeDefinition(ctx, { maxPreviewBytes: 262144 })
  const result = await def.execute({ path: 'out/demo.html' }, exec())
  assert.equal(result.path, '/ws/out/demo.html')
  assert.equal(result.size, 11)
  assert.equal(result.truncated, false)
  assert.equal(result.html, '<h1>hi</h1>')
  const meta = def.output.presentationMeta({ path: 'out/demo.html' }, result)
  assert.equal(meta.kind, 'visualize')
  assert.equal(meta.path, result.path)
  assert.equal(meta.html, '<h1>hi</h1>')
  assert.ok(emitLog.some(([event]) => event === 'fs/observed'))
  const summary = def.output.render({ path: 'out/demo.html' }, result)
  assert.ok(summary[0].text.startsWith('Visualized /ws/out/demo.html'))
})

test('execute: truncates over-cap files without dangling surrogates', async () => {
  const html = 'a'.repeat(99) + '😀' + 'b'.repeat(20)
  const { ctx } = fakeFs({ html, size: html.length })
  const def = createVisualizeDefinition(ctx, { maxPreviewBytes: 100 })
  const result = await def.execute({ path: 'out/demo.html' }, exec())
  assert.equal(result.truncated, true)
  assert.ok(result.html.length <= 100)
  const last = result.html.charCodeAt(result.html.length - 1)
  assert.ok(!(last >= 0xd800 && last <= 0xdbff), 'no dangling high surrogate')
  const summary = def.output.render({ path: 'out/demo.html' }, result)
  assert.ok(summary[0].text.includes('truncated'))
})

test('execute: missing file rejects with FS_NOT_FOUND', async () => {
  const { ctx } = fakeFs({ absent: true })
  const def = createVisualizeDefinition(ctx, { maxPreviewBytes: 100 })
  await assert.rejects(
    () => def.execute({ path: 'out/nope.html' }, exec()),
    (err) => err.code === 'FS_NOT_FOUND',
  )
})

test('execute: non-file target rejects with FS_NOT_REGULAR_FILE', async () => {
  const { ctx } = fakeFs({ notFile: true })
  const def = createVisualizeDefinition(ctx, { maxPreviewBytes: 100 })
  await assert.rejects(
    () => def.execute({ path: 'out' }, exec()),
    (err) => err.code === 'FS_NOT_REGULAR_FILE',
  )
})

test('formatSummary: bounded and informative', () => {
  const small = formatSummary({ path: 'out/demo.html', size: 12, truncated: false, html: '' })
  assert.equal(small, 'Visualized out/demo.html (12 B)')
  const big = formatSummary({ path: 'out/demo.html', size: 3 * 1024 * 1024, truncated: true, html: '' })
  assert.ok(big.includes('truncated'))
  assert.ok(big.length < 200)
})

test('buildVisualizeSteerMessage: names the tool and the path', () => {
  const msg = buildVisualizeSteerMessage('out/demo.html')
  assert.ok(msg.includes('visualize_html'))
  assert.ok(msg.includes('out/demo.html'))
  assert.ok(msg.length < 300)
})
