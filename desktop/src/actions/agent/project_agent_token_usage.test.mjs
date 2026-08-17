import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { persistConversationAndProjectUsage } = require('./project_agent_token_usage');
const temporaryRoots = [];

function conversation(id, usage) {
    return {
        actionId: 'review',
        cardInternalId: id,
        cardPath: `design/${id}.md`,
        completedAt: '2026-08-17T10:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: `conversation-${id}`,
        path: `design/activity/card__${id}.json#conversation=conversation-${id}`,
        providerSessions: [],
        startedAt: '2026-08-17T10:00:00.000Z',
        status: 'completed',
        title: 'Review',
        usage,
        usageSchemaVersion: 1,
        viewed: true,
    };
}

async function harness() {
    const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-usage-'));
    temporaryRoots.push(rootPath);
    await mkdir(join(rootPath, '.git'));
    const project = { branch: 'main', id: rootPath, rootPath };
    const commitTrackedPaths = vi.fn(async () => 'commit');
    const run = (id, usage) => ({
        conversation: conversation(id, usage),
        request: {
            activityOrigin: { cardInternalId: id, kind: 'card' },
            activityProject: project,
            projectFolder: 'design',
            releasesFolder: 'design/history',
        },
    });

    return { commitTrackedPaths, rootPath, run };
}

async function summary(rootPath) {
    return JSON.parse(await readFile(join(rootPath, 'design', 'agent_token_usage.json'), 'utf8'));
}

describe('project agent token usage persistence', () => {
    afterEach(async () => {
        await Promise.all(temporaryRoots.splice(0).map((rootPath) => rm(rootPath, { force: true, recursive: true })));
    });

    it('adds one persisted conversation delta once across retries', async () => {
        const { commitTrackedPaths, rootPath, run } = await harness();
        const completedRun = run('card-1', {cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10});

        await persistConversationAndProjectUsage(completedRun, { commitTrackedPaths });
        await persistConversationAndProjectUsage(completedRun, { commitTrackedPaths });

        expect((await summary(rootPath)).projectUsage).toMatchObject({
            cachedInputTokens: 2, inputTokens: 3, legacyTotalTokens: 0,
            outputTokens: 4, reasoningTokens: 1, totalTokens: 10,
        });
        expect(commitTrackedPaths).toHaveBeenCalledTimes(2);
    });

    it('serializes concurrent conversations without losing either delta', async () => {
        const { commitTrackedPaths, rootPath, run } = await harness();

        await Promise.all([
            persistConversationAndProjectUsage(run('card-1', {cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10}), { commitTrackedPaths }),
            persistConversationAndProjectUsage(run('card-2', {cachedInputTokens: 2, inputTokens: 4, outputTokens: 6, reasoningTokens: 8, totalTokens: 20}), { commitTrackedPaths }),
        ]);

        expect((await summary(rootPath)).projectUsage.totalTokens).toBe(30);
    });

    it('preserves malformed summary content and does not write conversation activity', async () => {
        const { commitTrackedPaths, rootPath, run } = await harness();
        const summaryPath = join(rootPath, 'design', 'agent_token_usage.json');
        await mkdir(join(rootPath, 'design'), { recursive: true });
        await writeFile(summaryPath, '{broken');

        await expect(persistConversationAndProjectUsage(run('card-1', {cachedInputTokens: 0, inputTokens: 1, outputTokens: 0, reasoningTokens: 0, totalTokens: 1}), { commitTrackedPaths })).rejects.toThrow('Malformed agent token usage summary');

        expect(await readFile(summaryPath, 'utf8')).toBe('{broken');
        expect(commitTrackedPaths).not.toHaveBeenCalled();
    });
});
