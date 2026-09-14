import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    conversationReference,
    persistConversationCheckpoint,
    persistInitialCardConversation,
    persistTerminalConversation,
} = require('./agent_conversation_persistence');

function initialRun(rootPath) {
    return {
        conversation: {
            actionId: 'implement', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null,
            entries: [], hasExplicitTitle: false, id: 'conversation-1', providerSessions: [], startedAt: '2026-09-14T08:00:00.000Z',
            status: 'running', timer: { elapsedMs: 0, runningStartedAt: '2026-09-14T08:00:00.000Z' }, title: 'Implement', viewed: true,
        },
        request: {
            activityOrigin: { cardInternalId: 'card-1', kind: 'card' },
            activityProject: { rootPath },
            cardPath: 'design/F-1.md',
            projectFolder: 'design',
        },
    };
}

describe('agent conversation persistence', () => {
    it('builds a stable activity reference from card identity and conversation id', () => {
        const request = {
            activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, activityProject: { rootPath: 'C:/repo' },
            projectFolder: 'design',
        };

        expect(conversationReference(request, 'conversation-1'))
            .toBe('design/activity/card__card-1.json#conversation=conversation-1');
    });

    it('rejects persistence before terminal activity ownership is supplied', async () => {
        await expect(persistTerminalConversation({ conversation: {}, request: {} }))
            .rejects.toThrow('Missing agent activityProject');
    });

    it('writes initial activity before linking and commits both backend-owned files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-persistence-'));
        const appendCardActivityReference = vi.fn(async (_project, _cardPath, _cardInternalId, activityPath) => {
            const activity = JSON.parse(await readFile(join(rootPath, activityPath), 'utf8'));
            expect(activity.conversations).toHaveLength(1);
        });
        const commitTrackedPaths = vi.fn(async () => 'commit');
        try {
            await persistInitialCardConversation(initialRun(rootPath), {
                appendCardActivityReference,
                assertGitRoot: vi.fn(async () => undefined),
                commitTrackedPaths,
            });

            expect(appendCardActivityReference).toHaveBeenCalledWith(
                { rootPath },
                'design/F-1.md',
                'card-1',
                'design/activity/card__card-1.json',
            );
            expect(commitTrackedPaths).toHaveBeenCalledWith(
                rootPath,
                ['design/activity/card__card-1.json', 'design/F-1.md'],
                'Start card agent activity',
            );
            expect(appendCardActivityReference.mock.invocationCallOrder[0])
                .toBeLessThan(commitTrackedPaths.mock.invocationCallOrder[0]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not commit or report a start-ready operation when card linking fails', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-persistence-'));
        const failure = new Error('Card identity mismatch');
        const commitTrackedPaths = vi.fn();
        try {
            await expect(persistInitialCardConversation(initialRun(rootPath), {
                appendCardActivityReference: vi.fn(async () => { throw failure; }),
                assertGitRoot: vi.fn(async () => undefined),
                commitTrackedPaths,
            })).rejects.toBe(failure);

            expect(commitTrackedPaths).not.toHaveBeenCalled();
            const activity = JSON.parse(await readFile(join(rootPath, 'design/activity/card__card-1.json'), 'utf8'));
            expect(activity.conversations).toHaveLength(1);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('uses combined linking only for new card conversations', async () => {
        const persistInitialCardConversation = vi.fn(async () => undefined);
        const upsertActivityConversation = vi.fn(async () => undefined);
        const run = initialRun('C:/repo');

        await persistConversationCheckpoint(run, { persistInitialCardConversation, upsertActivityConversation });
        await persistConversationCheckpoint({
            ...run,
            request: { ...run.request, conversation: run.conversation },
        }, { persistInitialCardConversation, upsertActivityConversation });
        await persistConversationCheckpoint({
            ...run,
            request: { ...run.request, activityOrigin: { kind: 'project' } },
        }, { persistInitialCardConversation, upsertActivityConversation });

        expect(persistInitialCardConversation).toHaveBeenCalledOnce();
        expect(upsertActivityConversation).toHaveBeenCalledTimes(2);
    });
});
