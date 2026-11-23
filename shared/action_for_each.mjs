export const FOR_EACH_MODES = new Set(['addPrompt', 'compact', 'newConversation']);
export const FOR_EACH_FAILURE_POLICIES = new Set(['logAndContinue', 'stopOnFirstFailure']);

const DATA_PLACEHOLDER_PATTERN = /\{\{\s*data(?:\s+([^{}\s][^{}]*?))?\s*\}\}/gu;
const FULL_RECORD_JSON_INDENT = 2;

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
    const allowedFields = new Set(['dataPath', 'failurePolicy', 'fileName', 'mode', 'recordsPerBatch', 'startIndex', 'stepByStep', 'value']);
    const unsupportedField = Object.keys(value).find((name) => !allowedFields.has(name));
    if (unsupportedField) throw new Error(`Unsupported ${fieldName} field: ${unsupportedField}`);
    if (value.dataPath !== undefined && typeof value.dataPath !== 'string') throw new Error(`Invalid ${fieldName}.dataPath`);
    if (typeof value.fileName !== 'string' || value.fileName.length === 0) throw new Error(`Invalid ${fieldName}.fileName`);
    if (!FOR_EACH_MODES.has(value.mode)) throw new Error(`Invalid ${fieldName}.mode`);
    if (!FOR_EACH_FAILURE_POLICIES.has(value.failurePolicy)) throw new Error(`Invalid ${fieldName}.failurePolicy`);
    const recordsPerBatch = value.recordsPerBatch === undefined ? 1 : value.recordsPerBatch;
    if (typeof recordsPerBatch !== 'number' || !Number.isSafeInteger(recordsPerBatch) || recordsPerBatch <= 0) {
        throw new Error(`Invalid ${fieldName}.recordsPerBatch`);
    }
    const startIndex = value.startIndex === undefined ? 0 : value.startIndex;
    if (typeof startIndex !== 'number' || !Number.isSafeInteger(startIndex) || startIndex < 0) {
        throw new Error(`Invalid ${fieldName}.startIndex`);
    }
    const stepByStep = value.stepByStep === undefined ? false : value.stepByStep;
    if (typeof stepByStep !== 'boolean') throw new Error(`Invalid ${fieldName}.stepByStep`);

    return {
        ...(value.dataPath !== undefined ? { dataPath: value.dataPath } : {}),
        failurePolicy: value.failurePolicy,
        fileName: value.fileName,
        mode: value.mode,
        recordsPerBatch,
        startIndex,
        stepByStep,
        value: validateJsonValue(value.value, `${fieldName}.value`),
    };
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

/**
 * Ordered loop records for one JSON root: a root array iterates directly, a selector picks an array
 * inside any other root, and without a selector the root is one record.
 */
export function forEachRecords(value, dataPath = '') {
    if (Array.isArray(value)) return [...value];
    const path = dataPath.trim();
    if (path.length === 0) return [value];
    const selected = dataPathValue(value, path);
    if (!Array.isArray(selected)) throw new Error(`For-each data path is not a list: ${path}`);

    return [...selected];
}

/** Resolve data placeholders against one record. Full records use JSON; path strings remain raw. */
export function resolveDataPlaceholders(text, record) {
    return text.replace(DATA_PLACEHOLDER_PATTERN, (_match, path) => {
        if (path === undefined) return JSON.stringify(record, null, FULL_RECORD_JSON_INDENT);

        const value = dataPathValue(record, path.trim());

        return typeof value === 'string' ? value : JSON.stringify(value);
    });
}
