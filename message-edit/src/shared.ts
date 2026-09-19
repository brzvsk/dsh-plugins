/** Same-origin endpoint owned by the Edit & Resend host plugin. */
export const EDIT_RESEND_PATH = '/edit-resend'

/** Header-slot order for the invisible inline-editor controller. */
export const VIEW_ORDER = 15

/** Editing discards all content after the latest user input. */
export type CascadePolicy = 'truncate'

/** User-visible operation represented by one child version. */
export type VersionOperation = 'edit'

/** Editable model-surface block classification. */
export type EditableBlockKind = 'user'

/** One text block in the last user message. */
export interface EditableMessageBlock {
  key: string
  turn: number
  eventSeq: number
  blockIndex: number
  kind: EditableBlockKind
  text: string
  time: number
  /** true when the block belongs to the still-open (in-flight/aborted) tail turn. */
  open?: boolean
}

export interface EditResendTimeline { sessionId: string; messages: EditableMessageBlock[] }

/** Edit one user text block and regenerate from its turn boundary. */
export interface EditOperation {
  action: 'edit'
  sessionId: string
  eventSeq: number
  blockIndex: number
  text: string
  cascade: CascadePolicy
}

export type EditResendOperation = EditOperation

/** Host acknowledgement after the child Agent has been published and queued. */
export interface EditResendOperationResult {
  sessionId: string
  queuedTurns: number
}
