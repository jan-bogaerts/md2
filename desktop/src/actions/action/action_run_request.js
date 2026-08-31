const ALLOWED_REQUEST_FIELDS = new Set(['actionId', 'context', 'conversationReservation', 'runInput']);
const ALLOWED_RUN_INPUT_FIELDS = new Set(['agent', 'command', 'continueFrom', 'diagramPath', 'extraPrompt', 'model', 'permissionMode', 'prompt', 'thinkingLevel']);
const CONTEXT_KINDS = new Set(['card', 'diagram', 'file', 'folder', 'merge-conflict', 'project']);

function readOptionalString(value, fieldName) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`Invalid action run input ${fieldName}`);

    return value;
}

function readPrompt(runInput) {
    if (!Object.hasOwn(runInput, 'prompt')) return {};
    if (typeof runInput.prompt !== 'string') throw new Error('Invalid action run input prompt');

    return { prompt: runInput.prompt };
}

function validateContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Missing action context');
    if (!CONTEXT_KINDS.has(context.kind)) throw new Error('Invalid action context kind');

    for (const [fieldName, value] of Object.entries(context)) {
        if (value !== undefined && typeof value !== 'string') throw new Error(`Invalid action context field ${fieldName}`);
    }

    return { ...context };
}

function validateRunInput(runInput = {}) {
    if (!runInput || typeof runInput !== 'object' || Array.isArray(runInput)) throw new Error('Invalid action runInput');

    const unsupportedField = Object.keys(runInput).find((fieldName) => !ALLOWED_RUN_INPUT_FIELDS.has(fieldName));
    if (unsupportedField) throw new Error(`Unsupported action runInput field: ${unsupportedField}`);

    return {
        agent: readOptionalString(runInput.agent, 'agent'),
        command: readOptionalString(runInput.command, 'command'),
        continueFrom: readOptionalString(runInput.continueFrom, 'continueFrom'),
        diagramPath: readOptionalString(runInput.diagramPath, 'diagramPath'),
        extraPrompt: readOptionalString(runInput.extraPrompt, 'extraPrompt') ?? '',
        model: readOptionalString(runInput.model, 'model'),
        permissionMode: readOptionalString(runInput.permissionMode, 'permissionMode'),
        ...readPrompt(runInput),
        thinkingLevel: readOptionalString(runInput.thinkingLevel, 'thinkingLevel'),
    };
}

function validateConversationReservation(reservation) {
    if (reservation === undefined) return undefined;
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) {
        throw new Error('Invalid agent conversation reservation');
    }
    const allowedFields = new Set(['activityPath', 'conversationId', 'reference']);
    const unsupportedField = Object.keys(reservation).find((fieldName) => !allowedFields.has(fieldName));
    if (unsupportedField) throw new Error(`Unsupported agent conversation reservation field: ${unsupportedField}`);
    if (typeof reservation.conversationId !== 'string' || reservation.conversationId.length === 0) {
        throw new Error('Missing reserved agent conversationId');
    }
    if (typeof reservation.activityPath !== 'string' || reservation.activityPath.length === 0) {
        throw new Error('Missing reserved agent activity path');
    }
    if (typeof reservation.reference !== 'string' || reservation.reference.length === 0) {
        throw new Error('Missing reserved agent conversation reference');
    }

    return { activityPath: reservation.activityPath, conversationId: reservation.conversationId, reference: reservation.reference };
}

function validateStartRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Missing action start request');

    const unsupportedField = Object.keys(request).find((fieldName) => !ALLOWED_REQUEST_FIELDS.has(fieldName));
    if (unsupportedField) throw new Error(`Unsupported action start field: ${unsupportedField}`);
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId');

    const conversationReservation = validateConversationReservation(request.conversationReservation);

    return {
        actionId: request.actionId,
        ...(conversationReservation ? { conversationReservation } : {}),
        context: validateContext(request.context),
        runInput: validateRunInput(request.runInput),
    };
}

function validatePreparePromptRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Missing action prompt request');
    const allowedFields = new Set(['actionId', 'context']);
    const unsupportedField = Object.keys(request).find((fieldName) => !allowedFields.has(fieldName));
    if (unsupportedField) throw new Error(`Unsupported action prompt field: ${unsupportedField}`);
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId');

    return { actionId: request.actionId, context: validateContext(request.context) };
}

module.exports = { validatePreparePromptRequest, validateStartRequest };
