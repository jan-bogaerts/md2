export const FOR_EACH_MODES = new Set(['addPrompt', 'compact', 'newConversation']);
export const FOR_EACH_FAILURE_POLICIES = new Set(['logAndContinue', 'stopOnFirstFailure']);

const DATA_PLACEHOLDER_PATTERN = /\{\{\s*data\s+([^{}]+?)\s*\}\}/gu;

function validateJsonValue(value, fieldName) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map((entry, index) => validateJsonValue(entry, `${fieldName}[${index}]`));
    if (!value || typeof value !== 'object') throw new Error(`Invalid ${fieldName}`);

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, validateJsonValue(entry, `${fieldName}.${key}`)]));
}

/** Validate one conversation-owned for-each configuration. */
export function validateForEachConfig(value, fieldName = 'forEach') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${fieldName}`);
    const allowedFields = new Set(['failurePolicy', 'fileName', 'mode', 'value']);
    const unsupportedField = Object.keys(value).find((name) => !allowedFields.has(name));
    if (unsupportedField) throw new Error(`Unsupported ${fieldName} field: ${unsupportedField}`);
    if (typeof value.fileName !== 'string' || value.fileName.length === 0) throw new Error(`Invalid ${fieldName}.fileName`);
    if (!FOR_EACH_MODES.has(value.mode)) throw new Error(`Invalid ${fieldName}.mode`);
    if (!FOR_EACH_FAILURE_POLICIES.has(value.failurePolicy)) throw new Error(`Invalid ${fieldName}.failurePolicy`);

    return {
        failurePolicy: value.failurePolicy,
        fileName: value.fileName,
        mode: value.mode,
        value: validateJsonValue(value.value, `${fieldName}.value`),
    };
}

/** Treat a root array as ordered records and every other JSON root as one record. */
export function forEachRecords(value) {
    return Array.isArray(value) ? [...value] : [value];
}

function dataPathValue(record, path) {
    const segments = path.split('.');
    if (segments.some((segment) => segment.length === 0)) throw new Error(`Missing for-each data path: ${path}`);
    let current = record;
    for (const segment of segments) {
        if (Array.isArray(current)) {
            if (!/^\d+$/u.test(segment)) throw new Error(`Missing for-each data path: ${path}`);
            const index = Number(segment);
            if (!Number.isSafeInteger(index) || index >= current.length) throw new Error(`Missing for-each data path: ${path}`);
            current = current[index];
            continue;
        }
        if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
            throw new Error(`Missing for-each data path: ${path}`);
        }
        current = current[segment];
    }

    return current;
}

/** Resolve data placeholders against one record. Strings remain raw; other JSON values serialize. */
export function resolveDataPlaceholders(text, record) {
    return text.replace(DATA_PLACEHOLDER_PATTERN, (_match, path) => {
        const value = dataPathValue(record, path.trim());

        return typeof value === 'string' ? value : JSON.stringify(value);
    });
}
