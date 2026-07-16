const ALLOWED_REQUEST_FIELDS = new Set(['actionId', 'context', 'runInput']);
const ALLOWED_RUN_INPUT_FIELDS = new Set(['agent', 'continueFrom', 'extraPrompt', 'model', 'thinkingLevel']);
const CONTEXT_KINDS = new Set(['card', 'file', 'folder', 'project']);

function readOptionalString(value, fieldName) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`Invalid action run input ${fieldName}`);

    return value;
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
        continueFrom: readOptionalString(runInput.continueFrom, 'continueFrom'),
        extraPrompt: readOptionalString(runInput.extraPrompt, 'extraPrompt') ?? '',
        model: readOptionalString(runInput.model, 'model'),
        thinkingLevel: readOptionalString(runInput.thinkingLevel, 'thinkingLevel'),
    };
}

function validateStartRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Missing action start request');

    const unsupportedField = Object.keys(request).find((fieldName) => !ALLOWED_REQUEST_FIELDS.has(fieldName));
    if (unsupportedField) throw new Error(`Unsupported action start field: ${unsupportedField}`);
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId');

    return { actionId: request.actionId, context: validateContext(request.context), runInput: validateRunInput(request.runInput) };
}

module.exports = { validateStartRequest };
