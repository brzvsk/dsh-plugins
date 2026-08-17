/**
 * dsh-visualize — node half.
 *
 * Registers the `visualize_html` tool and the human-facing `/visualize [path]`
 * command: reads an HTML file from the session workspace through `ctx.fs` (the
 * sandbox policy applies), renders a SHORT text summary for the model, and
 * embeds the capped HTML in the durable `presentationMeta` that the browser
 * card consumes. The HTML never enters model context; the canonical value is
 * execution-local.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { VisualizeConfig, VisualizeMeta, VisualizeValue } from './types.js'

export type { VisualizeConfig, VisualizeMeta, VisualizeValue } from './types.js'

export const DEFAULT_MAX_PREVIEW_BYTES = 262144

/** Cordis plugin name used by loader diagnostics. */
export const name = 'visualize'

/**
 * Services required by the node half. Exported (not a default-export static)
 * so the loader's module-namespace plugin unwrap reads it — the shipped tool
 * plugins use the same `apply`/`inject`/`name` named-export contract.
 * `commands`/`skills` are injected conditionally (see register* below), so a
 * composition without them still loads the tool.
 */
export const inject = ['tools', 'fs', 'systemPrompt'] as const

/** Minimal structural service surface (dsh-base mounts these in the host tree). */
export interface VisualizeServices {
  fs: {
    resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<{ displayPath: string }>
    stat(target: unknown, signal?: AbortSignal): Promise<{ version: unknown; type: string; size?: number } | undefined>
    readText(target: unknown, signal?: AbortSignal): Promise<string>
    /** Returns a PROMISE of an async iterable (dsh-fs contract); await before iterating. */
    streamText(target: unknown, signal?: AbortSignal): Promise<AsyncIterable<string>>
  }
  emit(event: string, ...args: unknown[]): void
  tools: { register(definition: unknown): () => void }
  systemPrompt: { section(options: { name: string; order: number; text: string }): () => void }
  /** Conditional service injection (cordis): callback runs only when all names are available. */
  inject(services: string[], callback: (child: VisualizeChildServices) => void): void
}

/** Structural child-context surface for the conditional command registration. */
export interface VisualizeChildServices {
  commands: {
    register(definition: VisualizeCommandDefinition): () => void
  }
}

/** Structural subset of the dsh-commands `CommandDefinition`. */
export interface VisualizeCommandDefinition {
  name: string
  description: string
  input?: { hint?: string }
  recordInput?: boolean
  handler: (invocation: VisualizeCommandInvocation) => { kind: 'success' | 'error'; text: string }
}

export interface VisualizeCommandInvocation {
  agent: { steer(message: unknown): void }
  rawInput: string
  signal: AbortSignal
}

/** The model-visible message the `/visualize <path>` command steers to the agent. */
export function buildVisualizeSteerMessage(path: string): string {
  return `Render the HTML file ${path} as a live preview in the Web UI: call the visualize_html tool, then mention the path as Markdown inline code in your final answer.`
}

export function validateConfig(config: VisualizeConfig = {}): Required<VisualizeConfig> {
  const { maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES } = config
  for (const key of Object.keys(config)) {
    if (key !== 'maxPreviewBytes') throw new Error(`dsh-visualize: unknown config key "${key}"`)
  }
  if (!Number.isSafeInteger(maxPreviewBytes) || maxPreviewBytes <= 0) {
    throw new Error('dsh-visualize: maxPreviewBytes must be a positive safe integer')
  }
  return { maxPreviewBytes }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

export function formatSummary(value: VisualizeValue): string {
  const base = `Visualized ${value.path} (${formatBytes(value.size)})`
  return value.truncated ? `${base} — preview truncated; open in browser for the full file.` : base
}

/** Parent traversal makes a symlinked cwd's identity observable; resolve it flat. */
const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/** Session workspace cwd for this call (mirrors dsh-tool-fs); undefined for non-agent callers. */
function sessionCwd(exec: { agent?: { session?: { header?: { cwd?: string } } } }, requestedPath: string): string | undefined {
  const cwd = exec.agent?.session?.header?.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  // Canonicalize only when traversal is involved; otherwise keep the raw cwd.
  return cwd
}

/** Cut at `n` code units without splitting a surrogate pair. */
function cutAtCodePointBoundary(s: string, n: number): string {
  let end = n
  const code = s.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return s.slice(0, end)
}

/** Drop a lone trailing high surrogate left by a provider chunk boundary. */
function trimDanglingSurrogate(s: string): string {
  const code = s.charCodeAt(s.length - 1)
  return code >= 0xd800 && code <= 0xdbff ? s.slice(0, -1) : s
}

/** Stream the file with a hard byte ceiling; never buffers more than `cap`. */
async function readPreview(
  fs: VisualizeServices['fs'],
  target: unknown,
  signal: AbortSignal,
  cap: number,
): Promise<{ html: string; truncated: boolean }> {
  const parts: string[] = []
  let total = 0
  let truncated = false
  const iterable = await fs.streamText(target, signal)
  for await (const chunk of iterable) {
    const need = cap - total
    if (need <= 0) {
      truncated = true
      break
    }
    if (chunk.length <= need) {
      parts.push(chunk)
      total += chunk.length
      continue
    }
    parts.push(cutAtCodePointBoundary(chunk, need))
    total += need
    truncated = true
    break
  }
  return { html: trimDanglingSurrogate(parts.join('')), truncated }
}

export function createVisualizeDefinition(ctx: VisualizeServices, config: Required<VisualizeConfig>) {
  const { maxPreviewBytes } = config
  return defineTool({
    name: 'visualize_html',
    description:
      'Render an HTML file as a live sandboxed preview inside the Web UI. Use for HTML you created — reports, dashboards, mockups, charts. Self-contained files (inline CSS/JS) render fully; files referencing sibling assets render only the inline part. The preview is isolated from the app: scripts inside it cannot reach the page.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Path to the HTML file, relative to the session workspace or absolute',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          size: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
          html: { type: 'string', required: true },
        },
      },
      render: (_args, value: VisualizeValue) => [{ type: 'text', text: formatSummary(value) }],
      presentationMeta: (_args, value: VisualizeValue): VisualizeMeta => ({
        kind: 'visualize',
        path: value.path,
        size: value.size,
        truncated: value.truncated,
        html: value.html,
      }),
    },
    timeoutMs: 15000,
    isConcurrencySafe: () => true,
    async execute(args: { path: string }, exec: { agent?: unknown; signal: AbortSignal }) {
      const cwd = sessionCwd(exec as { agent?: { session?: { header?: { cwd?: string } } } }, args.path)
      const target = await ctx.fs.resolve(args.path, {
        ...(cwd !== undefined ? { cwd } : {}),
        signal: exec.signal,
      })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) {
        ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
        throw new FsError(`cannot visualize "${target.displayPath}": not found`, 'FS_NOT_FOUND')
      }
      if (info.type !== 'file') {
        throw new FsError(`cannot visualize "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }
      const { html, truncated } = await readPreview(ctx.fs, target, exec.signal, maxPreviewBytes)
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      return { path: target.displayPath, size: info.size ?? html.length, truncated, html }
    },
  })
}

/** Human-facing `/visualize [path]` command: steers a model turn that calls the tool. */
function registerVisualizeCommand(ctx: VisualizeServices): void {
  ctx.inject(['commands'], (child) => {
    child.commands.register({
      name: 'visualize',
      description: 'Render an HTML file as a live preview in the chat',
      input: { hint: '[path]' },
      handler: ({ agent, rawInput }) => {
        const path = rawInput.trim()
        if (path === '') {
          return {
            kind: 'success',
            text: 'Usage: /visualize <path> — renders the HTML file as a sandboxed preview card, e.g. /visualize out/demo.html',
          }
        }
        agent.steer(
          createUserMessage({
            content: [{ type: 'text', text: buildVisualizeSteerMessage(path) }],
            // Host attestation of human authority (same as /plan): the steered
            // message counts as a direct user turn.
            source: { kind: 'user' },
          }),
        )
        return { kind: 'success', text: `Visualizing ${path}…` }
      },
    })
  })
}

export function apply(ctx: VisualizeServices, config: VisualizeConfig = {}) {
  const cfg = validateConfig(config)
  const disposers: Array<() => void> = [
    ctx.systemPrompt.section({
      name: 'tool:visualize_html',
      order: 112,
      text: 'Use the visualize_html tool to render an HTML file you created (report, dashboard, mockup) as a live preview in the Web UI. Self-contained files (inline CSS/JS) render fully; sibling assets do not load inside the preview. Mention the file path as Markdown inline code in your final answer.',
    }),
    ctx.tools.register(createVisualizeDefinition(ctx, cfg)),
  ]
  registerVisualizeCommand(ctx)
  return () => {
    for (const dispose of disposers) dispose()
  }
}
