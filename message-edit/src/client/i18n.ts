import { useSyncExternalStore } from 'react'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
let locale: LocaleRuntime
export function configureLocale(value: LocaleRuntime): void { locale = value }
export function useLanguage(): string {
  return useSyncExternalStore(fn => locale.subscribe(fn), () => locale.getSnapshot().active)
}
const copy = {
  en: { edit: 'Edit last message', hint: 'The reply after this message will be replaced.', send: 'Send again', cancel: 'Cancel', error: 'Could not send. Please try again.' },
  ru: { edit: 'Редактировать последнее сообщение', hint: 'Ответ после этого сообщения будет заменён.', send: 'Отправить заново', cancel: 'Отмена', error: 'Не удалось отправить. Попробуйте ещё раз.' },
  zh: { edit: '编辑最后一条消息', hint: '此消息之后的回复将被替换。', send: '重新发送', cancel: '取消', error: '发送失败，请重试。' },
}
export function strings(language: string) { return copy[language.split('-')[0] as keyof typeof copy] ?? copy.en }
