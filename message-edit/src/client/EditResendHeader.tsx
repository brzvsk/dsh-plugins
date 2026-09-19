import { useEffect, useMemo } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditResendFace } from './controller.ts'
import { InlineEdit } from './InlineEdit.tsx'
import { useLanguage } from './i18n.ts'
type Props = InjectFace<EditResendFace>
export function EditResendHeader({ useEditResend, load, edit }: Props) {
  const state = useEditResend(value => value)
  const language = useLanguage()
  const messages = useMemo(() => {
    const users = (state.timeline?.messages ?? []).filter(message => message.kind === 'user')
    const lastSeq = Math.max(-1, ...users.map(message => message.eventSeq))
    return users.filter(message => message.eventSeq === lastSeq)
  }, [state.timeline])
  useEffect(() => { load() }, [load])
  return <InlineEdit messages={messages} edit={edit} language={language} />
}
