import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectStatsWorkerService } from './project_stats_worker_service.js';

const temporaryDirectories = [];

function activityContent(conversationCount) {
    const conversations = Array.from({ length: conversationCount }, (_value, index) => ({
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F_1.md',
        completedAt: '2026-08-12T10:00:00.000Z',
        entries: [{ content: 'x'.repeat(1_000), id: `message-${index}`, kind: 'message', role: 'assistant', timestamp: '2026-08-12T10:00:00.000Z' }],
        id: `conversation-${index}`,
        providerSessions: [],
        startedAt: '2026-08-12T09:00:00.000Z',
        status: 'completed',
        title: 'Review',
        viewed: true,
    }));

    return JSON.stringify({
        actionSettings: {},
        conversations,
        origin: { cardInternalId: 'card-1', kind: 'card' },
        records: [],
        version: 4,
    });
}

async function createProject() {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'md2-stats-worker-'));
    temporaryDirectories.push(rootPath);
    await mkdir(path.join(rootPath, 'design', 'activity'), { recursive: true });

    return rootPath;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directoryPath) => rm(directoryPath, { force: true, recursive: true })));
});

describe('ProjectStatsWorkerService', () => {
    it('calculates representative large activity outside caller thread', async () => {
        const rootPath = await createProject();
        const activityPath = 'design/activity/card__card-1.json';
        await writeFile(path.join(rootPath, activityPath), activityContent(2_000), 'utf8');
        const service = new ProjectStatsWorkerService();
        const startedAt = performance.now();

        const result = await service.calculate(rootPath, [activityPath], 'large-data');

        expect(result.stats.conversations).toHaveLength(2_000);
        expect(performance.now() - startedAt).toBeLessThan(5_000);
    });

    it('keeps valid sources and warns for one unreadable path', async () => {
        const rootPath = await createProject();
        const activityPath = 'design/activity/card__card-1.json';
        await writeFile(path.join(rootPath, activityPath), activityContent(1), 'utf8');
        const service = new ProjectStatsWorkerService();

        const result = await service.calculate(rootPath, [activityPath, 'design/activity/card__missing.json'], 'partial');

        expect(result.stats.conversations).toHaveLength(1);
        expect(result.warnings).toEqual([expect.stringContaining('design/activity/card__missing.json')]);
    });

    it('cancels an in-flight calculation', async () => {
        const rootPath = await createProject();
        const activityPath = 'design/activity/card__card-1.json';
        await writeFile(path.join(rootPath, activityPath), activityContent(5_000), 'utf8');
        const service = new ProjectStatsWorkerService();
        const calculation = service.calculate(rootPath, [activityPath], 'cancelled');
        const rejection = expect(calculation).rejects.toThrow('Stats calculation cancelled');

        await service.cancel('cancelled');

        await rejection;
    });
});
