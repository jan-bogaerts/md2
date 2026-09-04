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

    return { content, label: messageLabel(message), sequence: message.sequence, timestamp: message.timestamp };
}

function entriesAfterCursor(conversation, afterMessageId) {
    if (!afterMessageId) return conversation.entries;
    const cursorIndex = conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === afterMessageId);

    return cursorIndex < 0 ? conversation.entries : conversation.entries.slice(cursorIndex + 1);
}

function removeConsecutiveDuplicates(items) {
    return items.filter((item, index) => index === 0 || item.label !== items[index - 1].label || item.content !== items[index - 1].content);
}

function normalizeConversationContext(conversation, afterMessageId = null) {
    const items = removeConsecutiveDuplicates(entriesAfterCursor(conversation, afterMessageId)
        .filter((entry) => entry.kind === 'message')
        .map(normalizeMessage)
        .filter((entry) => entry));
    if (items.length === 0) return '';

    return ['MD² conversation context', ...items.flatMap(({ content, label }) => [`[${label}]`, content])].join('\n\n');
}

module.exports = { normalizeConversationContext };
