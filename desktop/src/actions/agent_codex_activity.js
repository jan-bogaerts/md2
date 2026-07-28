const { normalizedContent } = require('./agent_event_utils');

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
    return normalizedContent(value) ?? '';
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
    if (item.result) return optionalContent({
        content: item.result.content,
        structuredContent: item.result.structuredContent,
    });
    if (Array.isArray(item.contentItems)) return optionalContent(item.contentItems);
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
        content: optionalContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function dynamicToolActivity(item, lifecycleStatus) {
    const label = [item.namespace, item.tool].filter((value) => typeof value === 'string' && value.length > 0).join(': ');

    return {
        ...activityBase(item, lifecycleStatus, label || 'Dynamic tool'),
        content: optionalContent(item.arguments),
        durationMs: item.durationMs,
        output: toolResult(item),
    };
}

function collaborationActivity(item, lifecycleStatus) {
    return {
        ...activityBase(item, lifecycleStatus, `Collaboration: ${item.tool}`),
        content: item.prompt ?? '',
        output: optionalContent({
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
