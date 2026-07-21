import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const { conversationReference, persistTerminalConversation } = require('./agent_conversation_persistence');

async function git(rootPath, args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath });

    return stdout.trim();
}

function conversation(status = 'completed') {
    return {
        actionId: 'implement', cardInternalId: 'card-1', completedAt: '2026-07-20T10:01:00.000Z', events: [],
        id: 'conversation-1', messages: [], providerSessions: [], startedAt: '2026-07-20T10:00:00.000Z',
        status, title: 'Implement',
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

    it('writes the terminal conversation once and commits only the activity file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-conversation-persistence-'));
        const request = {
            activityOrigin: { cardInternalId: 'card-1', kind: 'card' },
            activityProject: { branch: 'main', rootPath },
            projectFolder: 'design',
        };

        try {
            await git(rootPath, ['init', '-b', 'main']);
            await git(rootPath, ['config', 'user.email', 'md2-test@example.com']);
            await git(rootPath, ['config', 'user.name', 'MD2 Test']);
            await mkdir(join(rootPath, 'design'));
            await persistTerminalConversation({ conversation: conversation(), request });

            const activityPath = join(rootPath, 'design', 'activity', 'card__card-1.json');
            const activity = JSON.parse(await readFile(activityPath, 'utf8'));
            expect(activity.conversations).toEqual([expect.objectContaining({ id: 'conversation-1', status: 'completed' })]);

            const committedPaths = await git(rootPath, ['show', '--name-only', '--format=', 'HEAD']);
            expect(committedPaths.split(/\r?\n/u).filter((line) => line.length > 0))
                .toEqual(['design/activity/card__card-1.json']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    }, 15000);

    it('rejects persistence before terminal activity ownership is supplied', async () => {
        await expect(persistTerminalConversation({ conversation: conversation(), request: {} }))
            .rejects.toThrow('Missing agent activityProject');
    });
});
