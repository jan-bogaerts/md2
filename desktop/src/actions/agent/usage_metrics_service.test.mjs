import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CSV_COLUMNS, CSV_HEADER, UsageMetricsService, parseCsv } = require('./usage_metrics_service');

const temporaryFolders = [];
const TOKEN_USAGE = {
    cachedInputTokens: 2,
    inputTokens: 5,
    outputTokens: 3,
    reasoningTokens: 1,
    totalTokens: 11,
};

async function createDestination(projectFolder = 'design') {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'md2-usage-metrics-'));
    temporaryFolders.push(rootPath);
    await mkdir(path.join(rootPath, projectFolder), { recursive: true });

    return { destination: { projectFolder, rootPath }, filePath: path.join(rootPath, projectFolder, 'usage_metrics.csv') };
}

function startProject(service, destination) {
    service.startProject(destination, destination.projectFolder);
}

function parsedObjects(content) {
    return parseCsv(content).slice(1).filter(({ valid }) => valid).map(({ fields }) => (
        Object.fromEntries(CSV_COLUMNS.map((column, index) => [column, fields[index]]))
    ));
}

function codexSnapshot(usedPercent, resetsAt = 1_800_000_000, limitId = 'codex,pro') {
    return {
        available: true,
        buckets: [{
            limitId,
            primary: { resetsAt, usedPercent, windowDurationMins: 300 },
            secondary: null,
        }],
        observedAt: Date.parse('2026-08-17T10:00:00.000Z'),
    };
}

function claudeSnapshot(fiveHourPercent, weeklyPercent, resetsAt = Date.parse('2026-08-17T15:00:00.000Z')) {
    return {
        available: true,
        observedAt: Date.parse('2026-08-17T10:00:00.000Z'),
        windows: [
            { id: 'five_hour', resetsAt, usedPercent: fiveHourPercent },
            { id: 'weekly', resetsAt: resetsAt + 604_800_000, usedPercent: weeklyPercent },
        ],
    };
}

describe('UsageMetricsService', () => {
    afterEach(async () => {
        await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })));
    });

    it('creates one header and appends escaped token rows with empty account fields', async () => {
        const { destination, filePath } = await createDestination();
        const service = new UsageMetricsService();
        startProject(service, destination);

        await service.recordTokenUsage('codex', TOKEN_USAGE, Date.parse('2026-08-17T10:11:12.000Z'));
        await service.recordTokenUsage('claude', TOKEN_USAGE, Date.parse('2026-08-17T10:12:13.000Z'));

        const content = await readFile(filePath, 'utf8');
        expect(content.split(CSV_HEADER)).toHaveLength(2);
        const records = parsedObjects(content);
        expect(records).toHaveLength(2);
        expect(records[0]).toMatchObject({
            cached_input_tokens: '2',
            input_tokens: '5',
            limit_id: '',
            provider: 'codex',
            recorded_at: '2026-08-17T10:11:12.000Z',
            record_type: 'token_usage',
            total_tokens: '11',
            used_percent: '',
        });
    });

    it('uses RFC 4180 escaping for commas, quotes, and newlines', () => {
        const content = `${CSV_HEADER}\r\n2026-08-17T10:00:00.000Z,account_usage,codex,"pro,""team""",primary,300,2026-08-17T15:00:00.000Z,,,,,,10,\r\n`;
        const records = parseCsv(content);

        expect(records[1]).toEqual(expect.objectContaining({ valid: true }));
        expect(records[1].fields[3]).toBe('pro,"team"');
    });

    it('writes and restores quoted multiline limit identities', async () => {
        const { destination, filePath } = await createDestination();
        const limitId = 'pro,"team"\nshared';
        const service = new UsageMetricsService();
        startProject(service, destination);

        await service.recordAccountUsage('codex', codexSnapshot(10, 1_800_000_000, limitId));
        const restartedService = new UsageMetricsService();
        startProject(restartedService, destination);
        await restartedService.recordAccountUsage('codex', codexSnapshot(14, 1_800_000_000, limitId));

        const records = parsedObjects(await readFile(filePath, 'utf8'));
        expect(records.map((record) => record.limit_id)).toEqual([limitId, limitId]);
        expect(records.at(-1).used_percent_delta).toBe('4');
    });

    it('serializes concurrent writes to one project file', async () => {
        const { destination } = await createDestination();
        let activeWrites = 0;
        let maximumActiveWrites = 0;
        const serializedAppend = vi.fn(async (...parameters) => {
            activeWrites += 1;
            maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
            await new Promise((resolve) => setTimeout(resolve, 5));
            await appendFile(...parameters);
            activeWrites -= 1;
        });
        const service = new UsageMetricsService({ appendFile: serializedAppend });
        startProject(service, destination);

        await Promise.all(Array.from({ length: 5 }, (_, index) => (
            service.recordTokenUsage('codex', TOKEN_USAGE, Date.parse('2026-08-17T10:00:00.000Z') + index)
        )));

        expect(maximumActiveWrites).toBe(1);
        expect(serializedAppend).toHaveBeenCalledTimes(5);
    });

    it('maps provider windows and calculates first, same-window, reset, and negative deltas', async () => {
        const { destination, filePath } = await createDestination();
        const service = new UsageMetricsService();
        startProject(service, destination);

        await service.recordAccountUsage('codex', codexSnapshot(20));
        await service.recordAccountUsage('codex', codexSnapshot(25));
        await service.recordAccountUsage('codex', codexSnapshot(23));
        await service.recordAccountUsage('codex', codexSnapshot(4, 1_800_003_600));
        await service.recordAccountUsage('claude', claudeSnapshot(10, 30));

        const records = parsedObjects(await readFile(filePath, 'utf8'));
        expect(records.map(({
            provider,
            limit_id: limitId,
            window_id: windowId,
            window_duration_minutes: duration,
            used_percent_delta: delta,
        }) => ({ delta, duration, limitId, provider, windowId }))).toEqual([
            { delta: '', duration: '300', limitId: 'codex,pro', provider: 'codex', windowId: 'primary' },
            { delta: '5', duration: '300', limitId: 'codex,pro', provider: 'codex', windowId: 'primary' },
            { delta: '-2', duration: '300', limitId: 'codex,pro', provider: 'codex', windowId: 'primary' },
            { delta: '4', duration: '300', limitId: 'codex,pro', provider: 'codex', windowId: 'primary' },
            { delta: '', duration: '10080', limitId: 'default', provider: 'claude', windowId: 'weekly' },
        ]);
        expect(records[0].resets_at).toBe('2027-01-15T08:00:00.000Z');
    });

    it('treats one-minute reset timestamp drift as the same account window', async () => {
        const { destination, filePath } = await createDestination();
        const service = new UsageMetricsService();
        startProject(service, destination);

        await service.recordAccountUsage('codex', codexSnapshot(20, 1_800_000_000));
        await service.recordAccountUsage('codex', codexSnapshot(27.88, 1_799_999_940));

        const records = parsedObjects(await readFile(filePath, 'utf8'));
        expect(Number(records.at(-1).used_percent_delta)).toBeCloseTo(7.88);
    });

    it('restores last valid baselines after restart and skips unchanged snapshots', async () => {
        const { destination, filePath } = await createDestination();
        const firstService = new UsageMetricsService();
        startProject(firstService, destination);
        await firstService.recordAccountUsage('codex', codexSnapshot(20));
        await writeFile(filePath, `${await readFile(filePath, 'utf8')}malformed,row\r\n`, 'utf8');
        const restartedService = new UsageMetricsService();
        startProject(restartedService, destination);

        expect(await restartedService.recordAccountUsage('codex', codexSnapshot(20))).toBe(false);
        expect(await restartedService.recordAccountUsage('codex', codexSnapshot(27))).toBe(true);

        const records = parsedObjects(await readFile(filePath, 'utf8'));
        expect(records.at(-1).used_percent_delta).toBe('7');
    });

    it('separates a new row from valid existing CSV without a trailing newline', async () => {
        const { destination, filePath } = await createDestination();
        const firstService = new UsageMetricsService();
        startProject(firstService, destination);
        await firstService.recordAccountUsage('codex', codexSnapshot(20));
        const contentWithoutNewline = (await readFile(filePath, 'utf8')).trimEnd();
        await writeFile(filePath, contentWithoutNewline, 'utf8');
        const restartedService = new UsageMetricsService();
        startProject(restartedService, destination);

        await restartedService.recordAccountUsage('codex', codexSnapshot(25));

        const records = parsedObjects(await readFile(filePath, 'utf8'));
        expect(records).toHaveLength(2);
        expect(records.at(-1).used_percent_delta).toBe('5');
    });

    it('requires one active project and rejects malformed usage and account snapshots', async () => {
        const { destination, filePath } = await createDestination();
        const service = new UsageMetricsService();

        await expect(service.recordTokenUsage('codex', TOKEN_USAGE, Date.now()))
            .rejects.toThrow('Usage metrics project is not active');
        expect(() => service.startProject(destination, '..')).toThrow('Invalid usage metrics project');
        startProject(service, destination);
        expect(await service.recordTokenUsage('codex', { ...TOKEN_USAGE, inputTokens: -1 }, Date.now())).toBe(false);
        expect(await service.recordTokenUsage('codex', { ...TOKEN_USAGE, totalTokens: 12 }, Date.now())).toBe(false);
        expect(await service.recordAccountUsage('claude', { ...claudeSnapshot(10, 20), available: false })).toBe(false);
        expect(await service.recordAccountUsage('codex', codexSnapshot(Number.NaN))).toBe(false);
        await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('reports read and append failures without rejecting and allows later retry', async () => {
        const { destination } = await createDestination();
        const errorReporter = vi.fn();
        const appendFailure = new Error('disk full');
        const appendMetric = vi.fn()
            .mockRejectedValueOnce(appendFailure)
            .mockResolvedValue(undefined);
        const service = new UsageMetricsService({
            appendFile: appendMetric,
            errorReporter,
            readFile: vi.fn(async () => {
                const error = new Error('missing');
                error.code = 'ENOENT';
                throw error;
            }),
        });
        startProject(service, destination);

        expect(await service.recordTokenUsage('codex', TOKEN_USAGE, Date.now())).toBe(false);
        expect(await service.recordTokenUsage('codex', TOKEN_USAGE, Date.now())).toBe(true);
        expect(errorReporter).toHaveBeenCalledWith(appendFailure);
        expect(appendMetric).toHaveBeenCalledTimes(2);
        expect(appendMetric.mock.calls[1][1]).toMatch(/^recorded_at,/u);
    });

    it('writes only to the project currently owned by the service', async () => {
        const first = await createDestination();
        const second = await createDestination();
        const service = new UsageMetricsService();
        const snapshot = claudeSnapshot(12, 34);

        startProject(service, first.destination);
        await service.recordAccountUsage('claude', snapshot);
        startProject(service, second.destination);
        await service.recordAccountUsage('claude', snapshot);

        const firstRecords = parsedObjects(await readFile(first.filePath, 'utf8'));
        const secondRecords = parsedObjects(await readFile(second.filePath, 'utf8'));
        expect(firstRecords).toEqual(secondRecords);
        expect(firstRecords).toHaveLength(1);
        expect(firstRecords[0]).toMatchObject({ used_percent: '34', window_id: 'weekly' });
    });
});
