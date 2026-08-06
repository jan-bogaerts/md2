const { createMessageEntry } = require('./agent_conversation');

function nextConversationSequence(conversation) {
    const highestSequence = conversation.entries.reduce((highest, entry) => (
        Number.isSafeInteger(entry.sequence) ? Math.max(highest, entry.sequence) : highest
    ), 0);

    return Math.max(highestSequence, conversation.entries.length) + 1;
}

function nextRunSequence(run) {
    const sequence = run.nextSequence;
    run.nextSequence += 1;

    return sequence;
}

function createProviderEventEntryIndexes(entries) {
    const providerEventEntryIndexes = new Map();
    for (const [index, entry] of entries.entries()) {
        if (entry.kind === 'event' && typeof entry.providerItemId === 'string' && !providerEventEntryIndexes.has(entry.providerItemId)) {
            providerEventEntryIndexes.set(entry.providerItemId, index);
        }
    }

    return providerEventEntryIndexes;
}

function appendDiagnosticContent(eventEntry, content) {
    return { ...eventEntry, content: `${eventEntry.content}\n${content}` };
}

function lastMessageEntry(conversation) {
    return conversation.entries.findLast(({ kind }) => kind === 'message');
}

function assistantMessageId(run) {
    return run.streaming ? `${run.id}-turn-${run.turnIndex}-assistant` : `${run.id}-assistant`;
}

function startAssistantItem(run, itemId, timestamp) {
    if (run.assistantItems.has(itemId)) throw new Error(`Duplicate assistant item ${itemId}`);
    run.assistantItemIndex += 1;
    const item = {
        messageId: `${run.id}-turn-${run.turnIndex}-assistant-${run.assistantItemIndex}`,
        sequence: nextRunSequence(run),
    };
    run.assistantItems.set(itemId, item);
    run.currentAssistantMessageId = item.messageId;
    run.conversation.entries.push(createMessageEntry(
        item.messageId,
        'assistant',
        '',
        timestamp,
        run.agent,
        item.sequence,
    ));

    return item;
}

function assistantItem(run, itemId) {
    if (!itemId) return null;
    const item = run.assistantItems.get(itemId);
    if (!item) throw new Error(`Missing assistant item ${itemId}`);

    return item;
}

/**
 * Exact text appended to `existing` for `chunk`, including the paragraph separator.
 * Streaming chunks are provider deltas that must concatenate verbatim; the adapter owns their separators.
 */
function chunkSegment(existing, chunk, streaming) {
    if (streaming) return chunk;

    const trimmed = chunk.replace(/^\n+|\n+$/g, '');
    if (trimmed.length === 0) return '';
    if (existing.length === 0) return trimmed;

    return `\n\n${trimmed}`;
}

function joinChunk(existing, chunk, streaming) {
    return `${existing}${chunkSegment(existing, chunk, streaming)}`;
}

/** Appends a chunk and returns the appended segment, so streamed events carry the same separators. */
function appendAssistantOutput(run, content, timestamp, itemId = null) {
    const segment = chunkSegment(run.stdout, content, run.streaming);
    run.stdout += segment;
    const item = assistantItem(run, itemId);
    const messageId = item?.messageId ?? assistantMessageId(run);
    const currentIndex = run.conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === messageId);
    if (currentIndex < 0) {
        const initialContent = run.streaming ? content : content.replace(/^\n+|\n+$/g, '');
        const message = createMessageEntry(
            messageId,
            'assistant',
            initialContent,
            timestamp,
            run.agent,
            item?.sequence ?? nextRunSequence(run),
        );
        run.conversation.entries.push(message);

        return { message, segment };
    }

    const current = run.conversation.entries[currentIndex];
    const message = { ...current, content: joinChunk(current.content, content, run.streaming), timestamp };
    run.conversation.entries[currentIndex] = message;

    return { message, segment };
}

function replaceAssistantOutput(run, content, timestamp, itemId) {
    const item = assistantItem(run, itemId);
    const currentIndex = run.conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === item.messageId);
    if (currentIndex < 0) throw new Error(`Missing assistant message ${item.messageId}`);
    const current = run.conversation.entries[currentIndex];
    if (current.content === content) return { message: current, previousContent: current.content, replaced: false };
    if (!run.stdout.endsWith(current.content)) throw new Error(`Assistant item is not latest output: ${itemId}`);
    run.stdout = `${run.stdout.slice(0, run.stdout.length - current.content.length)}${content}`;
    const message = { ...current, content, timestamp };
    run.conversation.entries[currentIndex] = message;

    return { message, previousContent: current.content, replaced: true };
}

function completeAssistantOutput(run, completedAt) {
    const messageId = run.currentAssistantMessageId ?? assistantMessageId(run);
    const currentIndex = run.conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === messageId);
    if (currentIndex < 0) return;

    run.conversation.entries[currentIndex] = { ...run.conversation.entries[currentIndex], timestamp: completedAt };
}

module.exports = {
    appendAssistantOutput,
    appendDiagnosticContent,
    assistantItem,
    assistantMessageId,
    chunkSegment,
    completeAssistantOutput,
    createProviderEventEntryIndexes,
    joinChunk,
    lastMessageEntry,
    nextConversationSequence,
    nextRunSequence,
    replaceAssistantOutput,
    startAssistantItem,
};
