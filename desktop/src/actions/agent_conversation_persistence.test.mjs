import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    agentLogFilePath,
    clearIntermediatePersist,
    existingLogFilePath,
    persistConversation,
    queueConversationPersist,
    queueThrottledConversationPersist,
} = require('./agent_conversation_persistence');

const temporaryPaths = [];

describe('agent conversation persistence', () => {
    afterEach(async () => {
        vi.useRealTimers();
        await Promise.all(temporaryPaths.splice(0).map((temporaryPath) => rm(temporaryPath, { force: true, recursive: true })));
    });

    it('builds safe new and existing log paths inside the repository', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-persistence-'));
        temporaryPaths.push(rootPath);

        expect(agentLogFilePath(rootPath, 'design/card.md', 'agent:1')).toBe(join(rootPath, '.md2-agent-logs', 'design_card.md_agent_1.json'));
        expect(existingLogFilePath(rootPath, '.md2-agent-logs/existing.json')).toBe(join(rootPath, '.md2-agent-logs', 'existing.json'));
    });

    it('persists conversations atomically with formatted JSON', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-persistence-'));
        temporaryPaths.push(rootPath);
        const filePath = join(rootPath, '.md2-agent-logs', 'conversation.json');

        await persistConversation(filePath, { id: 'agent-1' });

        expect(await readFile(filePath, 'utf8')).toBe('{\n  "id": "agent-1"\n}\n');
    });

    it('queues conversation writes and manages throttled timers', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-persistence-'));
        temporaryPaths.push(rootPath);
        const run = {
            conversation: { id: 'agent-1' },
            filePath: join(rootPath, '.md2-agent-logs', 'conversation.json'),
            intermediatePersistTimer: null,
            lastIntermediatePersistAt: Date.now(),
            writeChain: Promise.resolve(),
        };

        await queueConversationPersist(run);
        expect(JSON.parse(await readFile(run.filePath, 'utf8'))).toEqual(run.conversation);

        vi.useFakeTimers();
        queueThrottledConversationPersist(run);
        expect(run.intermediatePersistTimer).not.toBeNull();
        clearIntermediatePersist(run);
        expect(run.intermediatePersistTimer).toBeNull();
    });
});
