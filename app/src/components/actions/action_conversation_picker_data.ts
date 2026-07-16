import type { AgentConversation } from '../../data/data_types'

export function formatConversationDateTime(startedAt: string) {
    const date = new Date(startedAt)
    if (Number.isNaN(date.getTime())) return startedAt

    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export function conversationPickerLabel(conversation: AgentConversation) {
    const dateTime = formatConversationDateTime(conversation.startedAt)

    return conversation.hasExplicitTitle ? `${conversation.title} — ${dateTime}` : dateTime
}
