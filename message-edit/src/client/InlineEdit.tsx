/**
 * Message-row edit affordance: injects edit + retry icon buttons into each
 * settled (and open-tail) message's icon-actions row via a MutationObserver,
 * because the official MessageIconActions exposes no plugin slot.
 */
import { useEffect } from 'react'
import type { EditableMessageBlock } from '../shared.ts'
import type { EditResendFace } from './controller.ts'
import styles from './InlineEdit.module.css'
import { strings } from './i18n.ts'

const STYLE = {
  panel: styles['panel'] ?? '',
  input: styles['input'] ?? '',
  footer: styles['footer'] ?? '',
  actions: styles['actions'] ?? '',
  iconButton: styles['iconButton'] ?? '',
  save: styles['save'] ?? '',
  cancel: styles['cancel'] ?? '',
  error: styles['error'] ?? '',
}

const EDIT_PATH = 'M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z'

function svgIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', path)
  p.setAttribute('fill', 'currentColor')
  svg.appendChild(p)
  return svg
}

type EditorCleanup = () => void

function mountEditor(block: EditableMessageBlock, edit: EditResendFace['edit'], close: () => void, language: string, row: HTMLElement): EditorCleanup {
  const text = strings(language)
  const bubble = row.parentElement?.querySelector<HTMLElement>('[class*="_bubble"]')
  if (!bubble) return () => {}
  const stack = bubble.parentElement!
  const originalBubbleStyle = bubble.style.display
  const originalStackStyle = stack.getAttribute('style')
  const originalRowStyle = row.style.display
  const panel = document.createElement('div')
  panel.className = STYLE.panel
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', text.edit)
  const input = document.createElement('textarea')
  input.className = STYLE.input
  input.value = block.text
  input.setAttribute('aria-label', text.edit)
  const footer = document.createElement('div')
  footer.className = STYLE.footer
  const errorEl = document.createElement('p')
  errorEl.className = STYLE.error
  errorEl.hidden = true
  const actions = document.createElement('div')
  actions.className = STYLE.actions
  const save = document.createElement('button')
  save.className = STYLE.save
  save.textContent = text.send
  const cancel = document.createElement('button')
  cancel.className = STYLE.cancel
  cancel.textContent = text.cancel
  actions.append(cancel, save)
  footer.append(actions)
  panel.append(input, errorEl, footer)
  bubble.style.display = 'none'
  row.style.display = 'none'
  stack.style.maxWidth = '100%'
  stack.style.width = '100%'
  stack.appendChild(panel)
  // Auto-grow the editor to fit its content (no oversized box for short text).
  const autoSize = (): void => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 360) + 'px'
  }
  input.addEventListener('input', autoSize)
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
  autoSize()
  let mounted = true
  let saving = false
  const saveEdit = (): void => {
    if (saving || !input.value.trim()) return
    saving = true
    save.disabled = true
    errorEl.hidden = true
    errorEl.textContent = ''
    void edit(block, input.value, 'truncate').then((outcome) => {
      if (!mounted) return
      if (outcome.ok) { close(); return }
      saving = false
      save.disabled = false
      errorEl.hidden = false
      errorEl.textContent = outcome.error ?? text.error
    })
  }
  const cancelEdit = (): void => { close() }
  const keydown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); saveEdit()
    }
  }
  save.addEventListener('click', saveEdit)
  cancel.addEventListener('click', cancelEdit)
  input.addEventListener('keydown', keydown)
  return () => {
    mounted = false
    save.removeEventListener('click', saveEdit)
    cancel.removeEventListener('click', cancelEdit)
    input.removeEventListener('keydown', keydown)
    input.removeEventListener('input', autoSize)
    panel.remove()
    bubble.style.display = originalBubbleStyle
    row.style.display = originalRowStyle
    if (originalStackStyle === null) stack.removeAttribute('style')
    else stack.setAttribute('style', originalStackStyle)
  }
}

function createEditorHost(edit: EditResendFace['edit'], language: string): { editBlock(block: EditableMessageBlock, row: HTMLElement): void; dispose(): void } {
  let active: EditorCleanup | undefined
  const editBlock = (block: EditableMessageBlock, row: HTMLElement): void => {
    active?.()
    let cleanup: EditorCleanup = () => {}
    let mounted = true
    const close = (): void => {
      if (!mounted) return
      mounted = false
      cleanup()
      if (active === close) active = undefined
    }
    active = close
    try {
      cleanup = mountEditor(block, edit, close, language, row)
    } catch (error: unknown) {
      active = undefined
      mounted = false
      throw error
    }
  }
  return { editBlock, dispose: () => { active?.() } }
}

export function InlineEdit({
  messages, edit, language,
}: {
  messages: readonly EditableMessageBlock[]
  edit: EditResendFace['edit']
  language: string
}): null {
  useEffect(() => {
    const cleanups: Array<() => void> = []
    const editors = createEditorHost(edit, language)
    let observer: MutationObserver | undefined

    const sync = (): void => {
      const actionRows = Array.from(document.querySelectorAll<HTMLElement>('[class*="actions"]'))
      const latestUser = Array.from(document.querySelectorAll('[data-chat-flow-kind="user"]')).at(-1)
      const claimedEvents = new Set<number>()
      for (const row of actionRows.reverse()) {
        const isLatest = row.closest('[data-chat-flow-kind="user"]') === latestUser
        const existingEdit = row.querySelector<HTMLButtonElement>('[data-message-edit]')
        if (existingEdit) existingEdit.hidden = !isLatest
        if (!isLatest) continue
        const marker = row as HTMLElement & { __editResendInjected?: boolean; __editResendEventSeq?: number }
        if (marker.__editResendInjected === true) {
          if (marker.__editResendEventSeq !== undefined) claimedEvents.add(marker.__editResendEventSeq)
          continue
        }
        const text = (row.parentElement?.parentElement?.textContent ?? '').trim()
        if (text.length === 0) continue
        const matchingEvents = [...new Set(messages
          .filter(message => message.kind === 'user' && message.text.length > 0 && text.includes(message.text.slice(0, 24)))
          .map(message => message.eventSeq))]
        const eventSeq = matchingEvents.find(candidate => !claimedEvents.has(candidate))
        if (eventSeq === undefined) continue
        const blocks = messages.filter(message => message.eventSeq === eventSeq && message.kind === 'user')
        if (blocks.length === 0) continue
        const previousMarker = marker.__editResendInjected
        const previousEventSeq = marker.__editResendEventSeq
        marker.__editResendInjected = true
        marker.__editResendEventSeq = eventSeq
        claimedEvents.add(eventSeq)

        const editButton = document.createElement('button')
        editButton.className = STYLE.iconButton
        editButton.dataset.messageEdit = 'true'
        editButton.setAttribute('aria-label', strings(language).edit)
        editButton.title = strings(language).edit
        editButton.appendChild(svgIcon(EDIT_PATH))
        const editMessage = (): void => {
          const latest = Array.from(document.querySelectorAll('[data-chat-flow-kind="user"]')).at(-1)
          if (row.closest('[data-chat-flow-kind="user"]') !== latest) return
          const block = blocks[0]
          if (block !== undefined) editors.editBlock(block, row)
        }
        editButton.addEventListener('click', editMessage)

        const officialButtons = Array.from(row.querySelectorAll('button'))
          .filter(button => button !== editButton)
        const lastOfficial = officialButtons.at(-1)
        if (lastOfficial) editButton.className = lastOfficial.className
        if (lastOfficial !== undefined) {
          lastOfficial.insertAdjacentElement('afterend', editButton)
        } else {
          row.appendChild(editButton)
        }
        cleanups.push(() => {
          editButton.removeEventListener('click', editMessage)
          editButton.remove()
          if (previousMarker === undefined) delete marker.__editResendInjected
          else marker.__editResendInjected = previousMarker
          if (previousEventSeq === undefined) delete marker.__editResendEventSeq
          else marker.__editResendEventSeq = previousEventSeq
        })
      }
    }

    sync()
    observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer?.disconnect()
      editors.dispose()
      for (const cleanup of cleanups.reverse()) cleanup()
    }
  }, [messages, edit, language])

  return null
}
