const { normalizedContent } = require('./agent_event_utils');

const MAX_EVENT_CONTENT_LENGTH = 16_384;
const MAX_EVENT_FIELDS = 12;
const TRUNCATED_EVENT_SUFFIX = '\n[event content truncated]';
const UNIFIED_DIFF_HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const SUPPORTED_CODEX_ITEM_TYPES = new Set([
    'collabAgentToolCall',
    'commandExecution',
    'contextCompaction',
    'dynamicToolCall',
    'enteredReviewMode',
    'exitedReviewMode',
    'fileChange',
    'imageView',
    'mcpToolCall',
    'plan',
    'reasoning',
    'webSearch',
]);

function itemStatus(item, lifecycleStatus) {
    return typeof item.status === 'string' ? item.status : lifecycleStatus;
}

function optionalContent(value) {
    const content = normalizedContent(value) ?? '';
    if (content.length <= MAX_EVENT_CONTENT_LENGTH) return content;

    const retainedLength = MAX_EVENT_CONTENT_LENGTH - TRUNCATED_EVENT_SUFFIX.length;

    return `${content.slice(0, retainedLength)}${TRUNCATED_EVENT_SUFFIX}`;
}

function readableFieldName(fieldName) {
    return fieldName
        .replace(/([a-z])([A-Z])/gu, '$1 $2')
        .replace(/[_-]+/gu, ' ')
        .replace(/^./u, (character) => character.toUpperCase());
}

function parseStructuredString(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

    try {
        return JSON.parse(trimmed);
    } catch {
        return 'Structured event detail unavailable';
    }
}

function selectedFieldValue(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (!Array.isArray(value)) return null;
    const values = value
        .filter((entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
        .map(String);

    return values.length > 0 ? values.join(', ') : null;
}

function selectedEventContent(value) {
    if (value === undefined || value === null) return '';
    const structuredValue = typeof value === 'string' ? parseStructuredString(value) : value;
    if (typeof structuredValue === 'string') return optionalContent(structuredValue);
    if (typeof structuredValue === 'number' || typeof structuredValue === 'boolean') return String(structuredValue);
    if (Array.isArray(structuredValue)) {
        const lines = structuredValue
            .map((entry) => (
                entry && typeof entry === 'object'
                    ? selectedEventContent(entry)
                    : selectedFieldValue(entry)
            ))
            .filter((entry) => entry !== null && entry.length > 0)
            .slice(0, MAX_EVENT_FIELDS);

        return optionalContent(lines.join('\n'));
    }
    if (typeof structuredValue !== 'object') return '';
    const lines = Object.entries(structuredValue)
        .map(([fieldName, fieldValue]) => {
            const selectedValue = selectedFieldValue(fieldValue);

            return selectedValue === null ? null : `${readableFieldName(fieldName)}: ${selectedValue}`;
        })
        .filter((entry) => entry !== null)
        .slice(0, MAX_EVENT_FIELDS);

    return optionalContent(lines.join('\n'));
}

function fileChangeContent(changes) {
    if (!Array.isArray(changes)) return '';

    return changes
        .filter((change) => typeof change?.path === 'string' && typeof change?.kind === 'string')
        .map(({ kind, path }) => `${kind}: ${path}`)
        .join('\n');
}

/** Count content-line additions and removals in one structurally valid unified diff. */
function countUnifiedDiffLines(diff) {
    if (typeof diff !== 'string' || diff.length === 0) return null;

    let deletions = 0;
    let foundHunk = false;
    let insertions = 0;
    let oldLinesRemaining = 0;
    let newLinesRemaining = 0;
    for (const line of diff.replace(/\r/gu, '').split('\n')) {
        if (oldLinesRemaining === 0 && newLinesRemaining === 0) {
            const match = UNIFIED_DIFF_HUNK_PATTERN.exec(line);
            if (!match) continue;

            foundHunk = true;
            oldLinesRemaining = Number.parseInt(match[2] ?? '1', 10);
            newLinesRemaining = Number.parseInt(match[4] ?? '1', 10);
            continue;
        }
        if (line.startsWith('\\ No newline at end of file')) continue;
        if (line.startsWith('+')) {
            insertions += 1;
            newLinesRemaining -= 1;
        } else if (line.startsWith('-')) {
            deletions += 1;
            oldLinesRemaining -= 1;
        } else if (line.startsWith(' ')) {
            oldLinesRemaining -= 1;
            newLinesRemaining -= 1;
        } else {
            return null;
        }
        if (oldLinesRemaining < 0 || newLinesRemaining < 0) return null;
    }
    if (!foundHunk || oldLinesRemaining !== 0 || newLinesRemaining !== 0) return null;

    return { deletions, insertions };
}

function fileChangeLineUsage(changes) {
    if (!Array.isArray(changes)) return null;
    const countedDiffs = changes
        .map(({ diff }) => countUnifiedDiffLines(diff))
        .filter((usage) => usage !== null);
    if (countedDiffs.length === 0) return null;

    return countedDiffs.reduce((total, usage) => ({
        deletions: total.deletions + usage.deletions,
        insertions: total.insertions + usage.insertions,
    }), { deletions: 0, insertions: 0 });
}

function toolResult(item) {
    if (item.error?.message) return item.error.message;
    if (item.result) {
        const content = selectedEventContent(item.result.content);
        const structuredContent = selectedEventContent(item.result.structuredContent);

        return optionalContent([content, structuredContent].filter((value) => value.length > 0).join('\n'));
    }
    if (Array.isArray(item.contentItems)) return selectedEventContent(item.contentItems);
    if (typeof item.success === 'boolean') return item.success ? 'Succeeded' : 'Failed';

    return '';
}

function eventBase(item, lifecycleStatus, label) {
    return {
        content: '',
        label,
        providerItemId: item.id,
        status: itemStatus(item, lifecycleStatus),
        type: item.type,
    };
}

function reasoningEvent(item, lifecycleStatus) {
    const summary = Array.isArray(item.summary) ? [...item.summary] : [];
    const details = Array.isArray(item.content) ? [...item.content] : [];

    return {
        ...eventBase(item, lifecycleStatus, 'Reasoning'),
        content: summary.length > 0 ? summary.join('\n\n') : details.join('\n\n'),
        details,
        summary,
    };
}

function commandEvent(item, lifecycleStatus) {
    return {
        ...eventBase(item, lifecycleStatus, item.command || 'Command'),
        command: item.command,
        content: item.aggregatedOutput ?? '',
        durationMs: item.durationMs,
        exitCode: item.exitCode,
        workingDirectory: item.cwd,
    };
}

function fileEvent(item, lifecycleStatus) {
    const status = itemStatus(item, lifecycleStatus);
    const lineUsage = status === 'completed' ? fileChangeLineUsage(item.changes) : null;

    return {
        ...eventBase(item, lifecycleStatus, 'File changes'),
        content: fileChangeContent(item.changes),
        ...(lineUsage ?? {}),
    };
}

function mcpEvent(item, lifecycleStatus) {
    const label = [item.server, item.tool].filter((value) => typeof value === 'string' && value.length > 0).join(': ');

    return {
        ...eventBase(item, lifecycleStatus, label || 'MCP tool'),
        content: selectedEventContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function dynamicToolEvent(item, lifecycleStatus) {
    const label = [item.namespace, item.tool].filter((value) => typeof value === 'string' && value.length > 0).join(': ');

    return {
        ...eventBase(item, lifecycleStatus, label || 'Dynamic tool'),
        content: selectedEventContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function collaborationEvent(item, lifecycleStatus) {
    const toolLabel = typeof item.tool === 'string' && item.tool.length > 0 ? item.tool : 'Agent tool';

    return {
        ...eventBase(item, lifecycleStatus, `Collaboration: ${toolLabel}`),
        content: item.prompt ?? '',
        output: selectedEventContent({
            agentsStates: item.agentsStates,
            receiverThreadIds: item.receiverThreadIds,
        }),
    };
}

function normalizeCodexEvent(item, lifecycleStatus) {
    if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') return null;
    if (!SUPPORTED_CODEX_ITEM_TYPES.has(item.type)) return null;
    if (item.type === 'reasoning') return reasoningEvent(item, lifecycleStatus);
    if (item.type === 'commandExecution') return commandEvent(item, lifecycleStatus);
    if (item.type === 'fileChange') return fileEvent(item, lifecycleStatus);
    if (item.type === 'mcpToolCall') return mcpEvent(item, lifecycleStatus);
    if (item.type === 'dynamicToolCall') return dynamicToolEvent(item, lifecycleStatus);
    if (item.type === 'collabAgentToolCall') return collaborationEvent(item, lifecycleStatus);
    if (item.type === 'webSearch') {
        return {
            ...eventBase(item, lifecycleStatus, 'Web search'),
            content: item.query,
            output: optionalContent(item.action),
        };
    }
    if (item.type === 'imageView') {
        return { ...eventBase(item, lifecycleStatus, 'Image view'), content: item.path };
    }
    if (item.type === 'plan') {
        return { ...eventBase(item, lifecycleStatus, 'Plan'), content: item.text };
    }
    if (item.type === 'contextCompaction') {
        return { ...eventBase(item, lifecycleStatus, 'Context compacted') };
    }
    if (item.type === 'enteredReviewMode' || item.type === 'exitedReviewMode') {
        const label = item.type === 'enteredReviewMode' ? 'Entered review mode' : 'Exited review mode';

        return { ...eventBase(item, lifecycleStatus, label), content: item.review };
    }

    return null;
}

function diagnosticEvent(method, itemType, itemId, sequence) {
    const providerItemId = typeof itemId === 'string' && itemId.length > 0 ? itemId : 'unknown';
    const normalizedType = typeof itemType === 'string' && itemType.length > 0 ? itemType : 'unknown';

    return {
        content: `${method}: ${normalizedType} (${providerItemId})`,
        label: 'Codex protocol diagnostic',
        providerItemId: `diagnostic:${providerItemId}:${sequence}`,
        status: 'completed',
        type: 'diagnostic',
    };
}

function systemEvent(method, params) {
    const turnId = typeof params.turnId === 'string' ? params.turnId : 'unknown-turn';
    const providerItemId = `system:${turnId}:${method}`;
    if (method === 'model/rerouted') {
        return {
            content: `${params.fromModel} to ${params.toModel}: ${optionalContent(params.reason)}`,
            label: 'Model rerouted',
            providerItemId,
            status: 'completed',
            type: 'system',
        };
    }
    if (method === 'model/safetyBuffering/updated') {
        return {
            content: optionalContent({ reasons: params.reasons, useCases: params.useCases }),
            label: 'Safety buffering',
            providerItemId,
            status: params.showBufferingUi ? 'inProgress' : 'completed',
            type: 'system',
        };
    }
    if (method === 'model/verification') {
        return {
            content: optionalContent(params.verifications),
            label: 'Model verification',
            providerItemId,
            status: 'completed',
            type: 'system',
        };
    }

    return null;
}

module.exports = {
    countUnifiedDiffLines,
    diagnosticEvent,
    normalizeCodexEvent,
    systemEvent,
};
