const { normalizedContent } = require('./agent_event_utils');

const MAX_ACTIVITY_CONTENT_LENGTH = 16_384;
const MAX_ACTIVITY_FIELDS = 12;
const TRUNCATED_ACTIVITY_SUFFIX = '\n[activity content truncated]';
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
    if (content.length <= MAX_ACTIVITY_CONTENT_LENGTH) return content;

    const retainedLength = MAX_ACTIVITY_CONTENT_LENGTH - TRUNCATED_ACTIVITY_SUFFIX.length;

    return `${content.slice(0, retainedLength)}${TRUNCATED_ACTIVITY_SUFFIX}`;
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
        return 'Structured activity detail unavailable';
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

function selectedActivityContent(value) {
    if (value === undefined || value === null) return '';
    const structuredValue = typeof value === 'string' ? parseStructuredString(value) : value;
    if (typeof structuredValue === 'string') return optionalContent(structuredValue);
    if (typeof structuredValue === 'number' || typeof structuredValue === 'boolean') return String(structuredValue);
    if (Array.isArray(structuredValue)) {
        const lines = structuredValue
            .map((entry) => (
                entry && typeof entry === 'object'
                    ? selectedActivityContent(entry)
                    : selectedFieldValue(entry)
            ))
            .filter((entry) => entry !== null && entry.length > 0)
            .slice(0, MAX_ACTIVITY_FIELDS);

        return optionalContent(lines.join('\n'));
    }
    if (typeof structuredValue !== 'object') return '';
    const lines = Object.entries(structuredValue)
        .map(([fieldName, fieldValue]) => {
            const selectedValue = selectedFieldValue(fieldValue);

            return selectedValue === null ? null : `${readableFieldName(fieldName)}: ${selectedValue}`;
        })
        .filter((entry) => entry !== null)
        .slice(0, MAX_ACTIVITY_FIELDS);

    return optionalContent(lines.join('\n'));
}

function fileChangeContent(changes) {
    if (!Array.isArray(changes)) return '';

    return changes
        .filter((change) => typeof change?.path === 'string' && typeof change?.kind === 'string')
        .map(({ kind, path }) => `${kind}: ${path}`)
        .join('\n');
}

function toolResult(item) {
    if (item.error?.message) return item.error.message;
    if (item.result) {
        const content = selectedActivityContent(item.result.content);
        const structuredContent = selectedActivityContent(item.result.structuredContent);

        return optionalContent([content, structuredContent].filter((value) => value.length > 0).join('\n'));
    }
    if (Array.isArray(item.contentItems)) return selectedActivityContent(item.contentItems);
    if (typeof item.success === 'boolean') return item.success ? 'Succeeded' : 'Failed';

    return '';
}

function activityBase(item, lifecycleStatus, label) {
    return {
        content: '',
        label,
        providerItemId: item.id,
        status: itemStatus(item, lifecycleStatus),
        type: item.type,
    };
}

function reasoningActivity(item, lifecycleStatus) {
    const summary = Array.isArray(item.summary) ? [...item.summary] : [];
    const details = Array.isArray(item.content) ? [...item.content] : [];

    return {
        ...activityBase(item, lifecycleStatus, 'Reasoning'),
        content: summary.length > 0 ? summary.join('\n\n') : details.join('\n\n'),
        details,
        summary,
    };
}

function commandActivity(item, lifecycleStatus) {
    return {
        ...activityBase(item, lifecycleStatus, item.command || 'Command'),
        command: item.command,
        content: item.aggregatedOutput ?? '',
        durationMs: item.durationMs,
        exitCode: item.exitCode,
        output: item.aggregatedOutput ?? '',
        workingDirectory: item.cwd,
    };
}

function fileActivity(item, lifecycleStatus) {
    return {
        ...activityBase(item, lifecycleStatus, 'File changes'),
        content: fileChangeContent(item.changes),
    };
}

function mcpActivity(item, lifecycleStatus) {
    const label = [item.server, item.tool].filter((value) => typeof value === 'string' && value.length > 0).join(': ');

    return {
        ...activityBase(item, lifecycleStatus, label || 'MCP tool'),
        content: selectedActivityContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function dynamicToolActivity(item, lifecycleStatus) {
    const label = [item.namespace, item.tool].filter((value) => typeof value === 'string' && value.length > 0).join(': ');

    return {
        ...activityBase(item, lifecycleStatus, label || 'Dynamic tool'),
        content: selectedActivityContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function collaborationActivity(item, lifecycleStatus) {
    const toolLabel = typeof item.tool === 'string' && item.tool.length > 0 ? item.tool : 'Agent tool';

    return {
        ...activityBase(item, lifecycleStatus, `Collaboration: ${toolLabel}`),
        content: item.prompt ?? '',
        output: selectedActivityContent({
            agentsStates: item.agentsStates,
            receiverThreadIds: item.receiverThreadIds,
        }),
    };
}

function normalizeCodexActivity(item, lifecycleStatus) {
    if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') return null;
    if (!SUPPORTED_CODEX_ITEM_TYPES.has(item.type)) return null;
    if (item.type === 'reasoning') return reasoningActivity(item, lifecycleStatus);
    if (item.type === 'commandExecution') return commandActivity(item, lifecycleStatus);
    if (item.type === 'fileChange') return fileActivity(item, lifecycleStatus);
    if (item.type === 'mcpToolCall') return mcpActivity(item, lifecycleStatus);
    if (item.type === 'dynamicToolCall') return dynamicToolActivity(item, lifecycleStatus);
    if (item.type === 'collabAgentToolCall') return collaborationActivity(item, lifecycleStatus);
    if (item.type === 'webSearch') {
        return {
            ...activityBase(item, lifecycleStatus, 'Web search'),
            content: item.query,
            output: optionalContent(item.action),
        };
    }
    if (item.type === 'imageView') {
        return { ...activityBase(item, lifecycleStatus, 'Image view'), content: item.path };
    }
    if (item.type === 'plan') {
        return { ...activityBase(item, lifecycleStatus, 'Plan'), content: item.text };
    }
    if (item.type === 'contextCompaction') {
        return { ...activityBase(item, lifecycleStatus, 'Context compacted') };
    }
    if (item.type === 'enteredReviewMode' || item.type === 'exitedReviewMode') {
        const label = item.type === 'enteredReviewMode' ? 'Entered review mode' : 'Exited review mode';

        return { ...activityBase(item, lifecycleStatus, label), content: item.review };
    }

    return null;
}

function diagnosticActivity(method, itemType, itemId, sequence) {
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

function systemActivity(method, params) {
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
    diagnosticActivity,
    normalizeCodexActivity,
    systemActivity,
};
