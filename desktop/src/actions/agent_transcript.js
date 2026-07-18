const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu');

function cleanContent(value) {
    return value.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r/g, '').trim();
}

function messageLabel(message) {
    if (message.role === 'user') return 'User';

    return `Assistant${message.agent ? ` (${message.agent})` : ''}`;
}

function normalizeMessage(message) {
    const content = cleanContent(message.content);
    if (content.length === 0) return null;

    return { content, label: messageLabel(message), timestamp: message.timestamp };
}

function normalizeEvent(event) {
    if (event.type === 'error') {
        const content = cleanContent(event.content);

        return content.length > 0 ? { content, label: 'Failure', timestamp: event.timestamp } : null;
    }
    if (!event.type.startsWith('tool.')) return null;
    const content = cleanContent(event.content);
    if (content.length === 0) return null;
    const toolType = event.type.slice('tool.'.length);

    return { content, label: toolType === 'result' ? 'Tool result' : `Tool (${toolType})`, timestamp: event.timestamp };
}

function messagesAfterCursor(conversation, afterMessageId) {
    if (!afterMessageId) return conversation.messages;
    const cursorIndex = conversation.messages.findIndex(({ id }) => id === afterMessageId);

    return cursorIndex < 0 ? conversation.messages : conversation.messages.slice(cursorIndex + 1);
}

function cursorTimestamp(conversation, afterMessageId) {
    if (!afterMessageId) return null;

    return conversation.messages.find(({ id }) => id === afterMessageId)?.timestamp ?? null;
}

function removeConsecutiveDuplicates(items) {
    return items.filter((item, index) => index === 0 || item.label !== items[index - 1].label || item.content !== items[index - 1].content);
}

function normalizeConversationContext(conversation, afterMessageId = null) {
    const sourceMessages = messagesAfterCursor(conversation, afterMessageId);
    const messages = sourceMessages.map(normalizeMessage).filter((message) => message);
    const eventCursorTimestamp = cursorTimestamp(conversation, afterMessageId);
    const events = conversation.events
        .map(normalizeEvent)
        .filter((event) => event && (eventCursorTimestamp === null || event.timestamp >= eventCursorTimestamp));
    const orderedItems = [...messages, ...events].sort((first, second) => first.timestamp.localeCompare(second.timestamp));
    const items = removeConsecutiveDuplicates(orderedItems);
    if (items.length === 0) return '';

    return ['MD² conversation context', ...items.flatMap(({ content, label }) => [`[${label}]`, content])].join('\n\n');
}

module.exports = { normalizeConversationContext };
