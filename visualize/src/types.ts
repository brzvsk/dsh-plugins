/**
 * Shared wire types for dsh-visualize.
 *
 * The node half produces a canonical (execution-local) value plus a durable
 * `presentationMeta` projection. The browser half reads ONLY the durable
 * projection (it rides in `tool/result.meta` → `ToolResultNode.meta`), so the
 * card renders identically during live streaming and log replay.
 */

/** Durable metadata embedded in the tool/result event; the browser card reads it. */
export type VisualizeMeta = {
  kind: 'visualize'
  /** Display path of the visualized file. */
  path: string
  /** Bytes read (real size when known, otherwise the read length). */
  size: number
  /** True when the embedded html was cut at the configured cap. */
  truncated: boolean
  /** The HTML content, capped at `maxPreviewBytes`. */
  html: string
}

/** Canonical tool value (execution-local, never replayed). */
export type VisualizeValue = {
  path: string
  size: number
  truncated: boolean
  html: string
}

/** Plugin config (`cordis.patch.yml` row). Unknown keys fail at load. */
export interface VisualizeConfig {
  /** Cap on the HTML bytes embedded in the durable result (default 256 KiB). */
  maxPreviewBytes?: number
}
