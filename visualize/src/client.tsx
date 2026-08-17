/**
 * dsh-visualize — browser half.
 *
 * Registers the `visualize_html` keyed tool view in the `tool.call.toolview`
 * slot: a running row, an error row, and a settled card that renders the
 * durable `meta.html` inside a sandboxed iframe (`sandbox="allow-scripts"`
 * WITHOUT allow-same-origin → opaque origin: scripts run but cannot reach the
 * page, cookies, storage, or same-origin resources). The card is a pure
 * function of the frozen call/result block, so replay renders identically.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { VisualizeMeta } from './types.js'

const STYLE_ID = 'dsh-visualize-styles'

function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-plugin', 'dsh-visualize')
  style.textContent = `
.viz-card{display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.35);border-radius:10px;overflow:hidden;margin:6px 0;max-width:100%;background:var(--dsw-surface, #fff)}
.viz-header{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:12px;flex-wrap:wrap}
.viz-title{font-weight:600}
.viz-path{color:var(--dsw-text-secondary, rgba(127,127,127,.9));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(420px,60%)}
.viz-size{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-badge{background:rgba(255,193,7,.18);color:#b8860b;border-radius:999px;padding:0 8px;font-size:11px}
.viz-action{background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer;margin-left:auto}
.viz-action:hover{background:rgba(127,127,127,.12)}
.viz-truncated{background:rgba(255,193,7,.12);color:#b8860b;padding:4px 10px;font-size:12px}
.viz-frame{width:100%;height:min(60vh,560px);border:0;border-top:1px solid rgba(127,127,127,.25);background:#fff;display:block}
.viz-row{font-size:13px;padding:8px 10px;border-radius:8px;margin:4px 0;border:1px solid rgba(127,127,127,.25)}
.viz-running{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-error{color:#c0392b;border-color:rgba(192,57,43,.4);background:rgba(192,57,43,.06)}
.viz-note{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-fallback{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`
  document.head.appendChild(style)
}

function parseArgs(argsRaw: string): { path?: string } {
  try {
    const value = JSON.parse(argsRaw)
    return value && typeof value === 'object' && typeof value.path === 'string' ? value : {}
  } catch {
    return {}
  }
}

function isRunning(block: ToolCallBlock): boolean {
  // RunningToolCall has no `kind`; ToolResultNode is discriminated by kind: 'tool-result'.
  return !('kind' in block)
}

function metaOf(node: ToolResultNode): VisualizeMeta | undefined {
  const meta = node.meta
  if (meta && typeof meta === 'object' && (meta as { kind?: unknown }).kind === 'visualize') {
    return meta as VisualizeMeta
  }
  return undefined
}

function firstText(block: ToolResultNode): string {
  for (const content of block.content) {
    const text = (content as { type?: string; text?: unknown }).text
    if (typeof text === 'string' && text.length > 0) return text
  }
  return 'visualize_html failed'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function copyHtml(html: string): void {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  void navigator.clipboard.writeText(html).catch(() => {})
}

function VisualizeToolView(props: ToolCallViewProps) {
  const { block, openFile } = props

  if (isRunning(block)) {
    const path = parseArgs((block as { argsRaw?: string }).argsRaw ?? '').path
    return (
      <div className="viz-row viz-running">
        {path !== undefined ? <>Visualizing <code>{path}</code>…</> : 'Visualizing HTML…'}
      </div>
    )
  }

  const node = block as ToolResultNode
  if (node.isError) {
    return <div className="viz-row viz-error">{firstText(node)}</div>
  }

  const meta = metaOf(node)
  if (meta === undefined) {
    const path = node.call !== null ? parseArgs(node.call.argsRaw).path : undefined
    return (
      <div className="viz-row viz-fallback">
        <span className="viz-note">Preview unavailable (older session record).</span>
        {path !== undefined && (
          <button type="button" className="viz-action" onClick={() => openFile(path)}>
            Open in browser
          </button>
        )}
      </div>
    )
  }

  const title = basename(meta.path)
  return (
    <div className="viz-card">
      <div className="viz-header">
        <span className="viz-title">{title}</span>
        <span className="viz-path" title={meta.path}>{meta.path}</span>
        <span className="viz-size">{formatBytes(meta.size)}</span>
        {meta.truncated && <span className="viz-badge">truncated</span>}
        <button type="button" className="viz-action" onClick={() => openFile(meta.path)}>
          Open in browser
        </button>
        <button type="button" className="viz-action" onClick={() => copyHtml(meta.html)}>
          Copy HTML
        </button>
      </div>
      {meta.truncated && (
        <div className="viz-truncated">Preview truncated — open in browser for the full file.</div>
      )}
      <iframe
        className="viz-frame"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={meta.html}
        title={`Preview of ${meta.path}`}
      />
    </div>
  )
}

export function apply(ctx: Context) {
  injectStyles()
  const dispose = ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'visualize_html' }, VisualizeToolView),
  )
  return () => {
    dispose()
  }
}

/**
 * Services required by the browser half, by SERVICE name (the client registry
 * reads the module's exported `inject`, same contract as shipped client
 * bundles). `slots` is provided by the client runtime.
 */
export const inject = ['slots'] as const
