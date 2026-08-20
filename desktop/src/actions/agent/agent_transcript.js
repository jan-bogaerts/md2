const { boundedAgentResult } = require('../../../../shared/agent_conversations.mjs');

const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu');
const HANDOFF_EVENT_TYPES = new Set([
    'collabAgentToolCall',
    'commandExecution',
    'dynamicToolCall',
    'fileChange',
    'mcpToolCall',
    'plan',
    'webSearch',
]);

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

function normalizeEvent(event) {
    if (event.type === 'error') {
        const content = cleanContent(event.content);

        return content.length > 0
            ? { content, label: 'Failure', sequence: event.sequence, timestamp: event.timestamp }
            : null;
    }
    if (event.type.startsWith('tool.')) {
        const resultContent = event.type === 'tool.result' ? boundedAgentResult(event.content) : event.content;
        const content = cleanContent(resultContent);
        if (content.length === 0) return null;
        const toolType = event.type.slice('tool.'.length);

        return {
            content,
            label: toolType === 'result' ? 'Tool result' : `Tool (${toolType})`,
            sequence: event.sequence,
            timestamp: event.timestamp,
        };
    }
    if (!HANDOFF_EVENT_TYPES.has(event.type)) return null;
    const resultContent = event.type === 'commandExecution'
        ? boundedAgentResult(event.content)
        : event.content;
    const output = typeof event.output === 'string' ? boundedAgentResult(event.output) : event.output;
    const eventValues = event.type === 'commandExecution'
        ? [event.command, resultContent]
        : [event.command, resultContent, output];
    const content = eventValues
        .filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)
        .map(cleanContent)
        .filter((value) => value.length > 0)
        .join('\n\n');
    if (content.length === 0) return null;

    return {
        content,
        label: event.label ?? event.type,
        sequence: event.sequence,
        timestamp: event.timestamp,
    };
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
        .map((entry) => entry.kind === 'message' ? normalizeMessage(entry) : normalizeEvent(entry))
        .filter((entry) => entry));
    if (items.length === 0) return '';

    return ['MD² conversation context', ...items.flatMap(({ content, label }) => [`[${label}]`, content])].join('\n\n');
}

module.exports = { normalizeConversationContext };
