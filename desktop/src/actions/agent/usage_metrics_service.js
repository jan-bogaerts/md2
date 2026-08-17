const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureInsideRoot } = require('../../git/git_commands');

const CSV_COLUMNS = [
    'recorded_at',
    'record_type',
    'provider',
    'limit_id',
    'window_id',
    'window_duration_minutes',
    'resets_at',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_tokens',
    'total_tokens',
    'used_percent',
    'used_percent_delta',
];
const CSV_HEADER = CSV_COLUMNS.join(',');
const DEFAULT_LIMIT_ID = 'default';
const SUPPORTED_PROVIDERS = new Set(['claude', 'codex']);
const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000;
const USAGE_METRICS_FILE = 'usage_metrics.csv';
const CLAUDE_WINDOW_DURATIONS = new Map([
    ['five_hour', 300],
    ['weekly', 10_080],
]);

function csvValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    if (!/[",\r\n]/u.test(text)) return text;

    return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(record) {
    return CSV_COLUMNS.map((column) => csvValue(record[column])).join(',');
}

function completeCsvRecord(values) {
    return Object.fromEntries(CSV_COLUMNS.map((column) => [column, values[column] ?? '']));
}

function finishCsvRecord(records, fields, field, valid) {
    records.push({ fields: [...fields, field], valid });
}

/** Parses RFC 4180 records while retaining row validity so malformed history can be skipped. */
function parseCsv(content) {
    const records = [];
    let fields = [];
    let field = '';
    let inQuotes = false;
    let afterQuote = false;
    let valid = true;
    for (let index = 0; index < content.length; index += 1) {
        const character = content[index];
        if (inQuotes) {
            if (character !== '"') {
                field += character;
                continue;
            }
            if (content[index + 1] === '"') {
                field += '"';
                index += 1;
                continue;
            }
            inQuotes = false;
            afterQuote = true;
            continue;
        }
        if (afterQuote) {
            if (character === ',') {
                fields.push(field);
                field = '';
                afterQuote = false;
                continue;
            }
            if (character === '\r' || character === '\n') {
                finishCsvRecord(records, fields, field, valid);
                if (character === '\r' && content[index + 1] === '\n') index += 1;
                fields = [];
                field = '';
                afterQuote = false;
                valid = true;
                continue;
            }
            valid = false;
            afterQuote = false;
        }
        if (character === '"') {
            if (field.length === 0) {
                inQuotes = true;
                continue;
            }
            valid = false;
            field += character;
            continue;
        }
        if (character === ',') {
            fields.push(field);
            field = '';
            continue;
        }
        if (character === '\r' || character === '\n') {
            finishCsvRecord(records, fields, field, valid);
            if (character === '\r' && content[index + 1] === '\n') index += 1;
            fields = [];
            field = '';
            valid = true;
            continue;
        }
        field += character;
    }
    if (inQuotes) valid = false;
    if (fields.length > 0 || field.length > 0 || afterQuote || !valid) finishCsvRecord(records, fields, field, valid);

    return records;
}

function validTimestamp(timestamp) {
    return typeof timestamp === 'number' && Number.isFinite(timestamp);
}

function isoTimestamp(timestamp) {
    if (!validTimestamp(timestamp)) return null;
    try {
        return new Date(timestamp).toISOString();
    } catch {
        return null;
    }
}

function validIsoTimestamp(value) {
    if (typeof value !== 'string') return false;

    return isoTimestamp(Date.parse(value)) === value;
}

function resetTimestampMilliseconds(provider, resetTimestamp) {
    if (!validTimestamp(resetTimestamp)) return null;
    if (provider === 'codex' && resetTimestamp < UNIX_MILLISECONDS_THRESHOLD) return resetTimestamp * 1000;

    return resetTimestamp;
}

function validTokenCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function normalizeTokenUsage(usage) {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
    const values = {
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
    };
    if (!Object.values(values).every(validTokenCount)) return null;
    const calculatedTotal = values.inputTokens + values.cachedInputTokens + values.outputTokens + values.reasoningTokens;
    if (values.totalTokens !== calculatedTotal) return null;

    return values;
}

function accountKey(provider, limitId, windowId) {
    return `${provider}\u0000${limitId}\u0000${windowId}`;
}

function normalizeAccountWindow(provider, limitId, windowId, windowDurationMinutes, window) {
    if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
    if (typeof limitId !== 'string' || limitId.length === 0) return null;
    if (typeof windowId !== 'string' || windowId.length === 0) return null;
    if (!validTimestamp(window.resetsAt)) return null;
    if (!Number.isFinite(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) return null;
    if (!Number.isFinite(windowDurationMinutes) || windowDurationMinutes <= 0) return null;
    const resetTime = isoTimestamp(resetTimestampMilliseconds(provider, window.resetsAt));
    if (!resetTime) return null;

    return {
        limitId,
        resetsAt: resetTime,
        usedPercent: window.usedPercent,
        windowDurationMinutes,
        windowId,
    };
}

function codexAccountWindows(snapshot) {
    if (!Array.isArray(snapshot.buckets)) return null;
    const windows = [];
    for (const bucket of snapshot.buckets) {
        if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return null;
        if (typeof bucket.limitId !== 'string' || bucket.limitId.length === 0) return null;
        for (const windowId of ['primary', 'secondary']) {
            const window = bucket[windowId];
            if (window === null || window === undefined) continue;
            const normalized = normalizeAccountWindow(
                'codex',
                bucket.limitId,
                windowId,
                window.windowDurationMins,
                window,
            );
            if (!normalized) return null;
            windows.push(normalized);
        }
    }

    return windows;
}

function claudeAccountWindows(snapshot) {
    if (!Array.isArray(snapshot.windows)) return null;
    const windows = [];
    for (const window of snapshot.windows) {
        const windowDurationMinutes = CLAUDE_WINDOW_DURATIONS.get(window?.id);
        if (!windowDurationMinutes) return null;
        const normalized = normalizeAccountWindow(
            'claude',
            DEFAULT_LIMIT_ID,
            window.id,
            windowDurationMinutes,
            window,
        );
        if (!normalized) return null;
        windows.push(normalized);
    }

    return windows;
}

function normalizeAccountSnapshot(provider, snapshot) {
    if (!SUPPORTED_PROVIDERS.has(provider)) return null;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    if (snapshot.available !== true || !validTimestamp(snapshot.observedAt)) return null;
    const recordedAt = isoTimestamp(snapshot.observedAt);
    if (!recordedAt) return null;
    const windows = provider === 'codex' ? codexAccountWindows(snapshot) : claudeAccountWindows(snapshot);
    if (!windows || windows.length === 0) return null;
    if (new Set(windows.map(({ limitId, windowId }) => accountKey(provider, limitId, windowId))).size !== windows.length) return null;

    return { recordedAt, windows };
}

function tokenRecord(provider, usage, recordedAt) {
    return completeCsvRecord({
        cached_input_tokens: usage.cachedInputTokens,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        provider,
        reasoning_tokens: usage.reasoningTokens,
        recorded_at: recordedAt,
        record_type: 'token_usage',
        total_tokens: usage.totalTokens,
    });
}

function accountRecord(provider, window, recordedAt, delta) {
    return completeCsvRecord({
        limit_id: window.limitId,
        provider,
        recorded_at: recordedAt,
        record_type: 'account_usage',
        resets_at: window.resetsAt,
        used_percent: window.usedPercent,
        used_percent_delta: delta,
        window_duration_minutes: window.windowDurationMinutes,
        window_id: window.windowId,
    });
}

function validRestoredAccountRecord(record) {
    if (record.length !== CSV_COLUMNS.length) return false;
    const values = Object.fromEntries(CSV_COLUMNS.map((column, index) => [column, record[index]]));
    if (values.record_type !== 'account_usage' || !SUPPORTED_PROVIDERS.has(values.provider)) return false;
    if (!values.limit_id || !values.window_id || !validIsoTimestamp(values.recorded_at)) return false;
    if (!validIsoTimestamp(values.resets_at) || !Number.isFinite(Number(values.used_percent))) return false;
    if (!Number.isFinite(Number(values.window_duration_minutes)) || Number(values.window_duration_minutes) <= 0) return false;
    if (values.used_percent_delta !== '' && !Number.isFinite(Number(values.used_percent_delta))) return false;
    const tokenColumns = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens'];

    return tokenColumns.every((column) => values[column] === '');
}

function restoreBaselines(content) {
    const records = parseCsv(content);
    if (records.length === 0 || !records[0].valid || records[0].fields.join(',') !== CSV_HEADER) return new Map();
    const baselines = new Map();
    for (const { fields, valid } of records.slice(1)) {
        if (!valid || !validRestoredAccountRecord(fields)) continue;
        const values = Object.fromEntries(CSV_COLUMNS.map((column, index) => [column, fields[index]]));
        const key = accountKey(values.provider, values.limit_id, values.window_id);
        baselines.set(key, { resetsAt: values.resets_at, usedPercent: Number(values.used_percent) });
    }

    return baselines;
}

function usageMetricsPath(destination) {
    if (!destination || typeof destination !== 'object' || Array.isArray(destination)) return null;
    const { projectFolder, rootPath } = destination;
    if (typeof rootPath !== 'string' || rootPath.length === 0) return null;
    if (typeof projectFolder !== 'string') return null;
    let projectFolderPath;
    try {
        projectFolderPath = ensureInsideRoot(rootPath, path.resolve(rootPath, projectFolder));
    } catch {
        return null;
    }

    return ensureInsideRoot(rootPath, path.join(projectFolderPath, USAGE_METRICS_FILE));
}

/** Owns append-only project usage metrics, per-file ordering, and persisted account baselines. */
class UsageMetricsService {
    constructor(dependencies = {}) {
        this.appendFile = dependencies.appendFile ?? fs.appendFile;
        this.errorReporter = dependencies.errorReporter ?? (() => undefined);
        this.readFile = dependencies.readFile ?? fs.readFile;
        this.fileStates = new Map();
        this.fileWrites = new Map();
    }

    async recordTokenUsage(destination, provider, usageValue, recordedAtValue) {
        const filePath = usageMetricsPath(destination);
        const usage = normalizeTokenUsage(usageValue);
        const recordedAt = isoTimestamp(recordedAtValue);
        if (!filePath || !SUPPORTED_PROVIDERS.has(provider) || !usage || !recordedAt) return false;

        return this.runNonFatal(filePath, async () => {
            const state = await this.loadFileState(filePath);
            await this.appendRecords(filePath, state, [tokenRecord(provider, usage, recordedAt)]);

            return true;
        });
    }

    async recordAccountUsage(destination, provider, snapshotValue) {
        const filePath = usageMetricsPath(destination);
        const snapshot = normalizeAccountSnapshot(provider, snapshotValue);
        if (!filePath || !snapshot) return false;

        return this.runNonFatal(filePath, async () => {
            const state = await this.loadFileState(filePath);
            const changed = snapshot.windows.filter((window) => {
                const baseline = state.baselines.get(accountKey(provider, window.limitId, window.windowId));

                return !baseline || baseline.usedPercent !== window.usedPercent || baseline.resetsAt !== window.resetsAt;
            });
            if (changed.length === 0) return false;
            const records = changed.map((window) => {
                const baseline = state.baselines.get(accountKey(provider, window.limitId, window.windowId));
                const delta = !baseline ? '' : baseline.resetsAt === window.resetsAt
                    ? window.usedPercent - baseline.usedPercent
                    : window.usedPercent;

                return accountRecord(provider, window, snapshot.recordedAt, delta);
            });
            await this.appendRecords(filePath, state, records);
            changed.forEach((window) => {
                const key = accountKey(provider, window.limitId, window.windowId);
                state.baselines.set(key, { resetsAt: window.resetsAt, usedPercent: window.usedPercent });
            });

            return true;
        });
    }

    async runNonFatal(filePath, operation) {
        try {
            return await this.enqueue(filePath, operation);
        } catch (error) {
            try {
                await this.errorReporter(error);
            } catch {
                // Metrics and metrics error reporting must not affect agent runs.
            }

            return false;
        }
    }

    enqueue(filePath, operation) {
        const previous = this.fileWrites.get(filePath) ?? Promise.resolve();
        const write = previous.catch(() => undefined).then(operation);
        this.fileWrites.set(filePath, write);
        const clear = () => {
            if (this.fileWrites.get(filePath) === write) this.fileWrites.delete(filePath);
        };
        void write.then(clear, clear);

        return write;
    }

    async loadFileState(filePath) {
        const current = this.fileStates.get(filePath);
        if (current) return current;
        let content = '';
        try {
            content = await this.readFile(filePath, 'utf8');
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        const state = {
            baselines: restoreBaselines(content),
            hasContent: content.length > 0,
            needsRecordSeparator: content.length > 0 && !/[\r\n]$/u.test(content),
        };
        this.fileStates.set(filePath, state);

        return state;
    }

    async appendRecords(filePath, state, records) {
        const rows = records.map(csvRow).join('\r\n');
        const header = state.hasContent ? '' : `${CSV_HEADER}\r\n`;
        const recordSeparator = state.needsRecordSeparator ? '\r\n' : '';
        const content = `${recordSeparator}${header}${rows}\r\n`;
        await this.appendFile(filePath, content, 'utf8');
        state.hasContent = true;
        state.needsRecordSeparator = false;
    }
}

module.exports = {
    CSV_COLUMNS,
    CSV_HEADER,
    UsageMetricsService,
    parseCsv,
};
