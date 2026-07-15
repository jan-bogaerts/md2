const ESCAPE_CHARACTER = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu')

function cleanContent(value) {
    return value.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r/g, '').trim()
}

function messageLabel(message) {
    if (message.role === 'user') return 'User'
    if (message.role === 'assistant' || message.role === 'agent') return `Assistant${message.agent ? ` (${message.agent})` : ''}`
    if (message.role === 'stderr') return 'Failure'
    if (message.role === 'stdout') return 'Assistant'

    return 'System'
}

function normalizeMessage(message) {
    const content = cleanContent(message.content)
    if (content.length === 0) return null

    return { content, label: messageLabel(message), timestamp: message.timestamp }
}

function parsedEventContent(event) {
    try {
        return JSON.parse(event.content)
    } catch {
        return null
    }
}

function codexToolEvent(event, payload) {
    if (event.type !== 'item.completed' || !payload?.item || payload.item.type === 'agent_message' || payload.item.type === 'reasoning') return null
    const content = payload.item.aggregated_output
        ?? payload.item.output
        ?? payload.item.result
        ?? payload.item.changes
        ?? payload.item.command
        ?? payload.item.path
        ?? payload.item.name
    if (content === undefined || content === null) return null
    const normalizedContent = cleanContent(typeof content === 'string' ? content : JSON.stringify(content))
    if (normalizedContent.length === 0) return null

    return { content: normalizedContent, label: `Tool (${payload.item.type})`, timestamp: event.timestamp }
}

function claudeToolEvent(event, payload) {
    if (event.type !== 'user' || !Array.isArray(payload?.message?.content)) return null
    const results = payload.message.content
        .filter(({ type }) => type === 'tool_result')
        .map(({ content }) => typeof content === 'string' ? content : JSON.stringify(content))
        .map(cleanContent)
        .filter((content) => content.length > 0)
    if (results.length === 0) return null

    return { content: results.join('\n'), label: 'Tool result', timestamp: event.timestamp }
}

function normalizeEvent(event) {
    if (event.type === 'stderr' || event.type === 'error' || event.type === 'failed' || event.type === 'turn.failed') {
        const payload = parsedEventContent(event)
        const failure = payload?.error?.message ?? payload?.message ?? payload?.error ?? event.content
        const content = cleanContent(typeof failure === 'string' ? failure : JSON.stringify(failure))

        return content.length > 0 ? { content, label: 'Failure', timestamp: event.timestamp } : null
    }

    const payload = parsedEventContent(event)

    return codexToolEvent(event, payload) ?? claudeToolEvent(event, payload)
}

function messagesAfterCursor(conversation, afterMessageId) {
    if (!afterMessageId) return conversation.messages
    const cursorIndex = conversation.messages.findIndex(({ id }) => id === afterMessageId)

    return cursorIndex < 0 ? conversation.messages : conversation.messages.slice(cursorIndex + 1)
}

function cursorTimestamp(conversation, afterMessageId) {
    if (!afterMessageId) return null

    return conversation.messages.find(({ id }) => id === afterMessageId)?.timestamp ?? null
}

function removeConsecutiveDuplicates(items) {
    return items.filter((item, index) => index === 0 || item.label !== items[index - 1].label || item.content !== items[index - 1].content)
}

function normalizeConversationContext(conversation, afterMessageId = null) {
    const sourceMessages = messagesAfterCursor(conversation, afterMessageId)
    const messages = sourceMessages.map(normalizeMessage).filter((message) => message)
    const eventCursorTimestamp = cursorTimestamp(conversation, afterMessageId)
    const events = conversation.events
        .map(normalizeEvent)
        .filter((event) => event && (eventCursorTimestamp === null || event.timestamp >= eventCursorTimestamp))
    const orderedItems = [...messages, ...events].sort((first, second) => first.timestamp.localeCompare(second.timestamp))
    const items = removeConsecutiveDuplicates(orderedItems)
    if (items.length === 0) return ''

    return ['MD² conversation context', ...items.flatMap(({ content, label }) => [`[${label}]`, content])].join('\n\n')
}

module.exports = { normalizeConversationContext }
