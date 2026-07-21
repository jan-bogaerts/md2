import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
    appendActionActivity,
    listAgentConversationReferences,
    loadCardActivity,
    upsertActivityConversation,
} = require('./activity_files');

async function git(rootPath, args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath });

    return stdout.trim();
}

function commitReference(commit, branch = 'feature') {
    return {
        branch, commit, committedAt: '2026-07-20T10:00:00.000Z', deletions: 0,
        filePaths: ['design/card.md'], filesChanged: 1, insertions: 1,
    };
}

function activityRecord(executionId, commits) {
    const origin = { cardInternalId: 'card-1', kind: 'card' };

    return {
        commits, completedAt: '2026-07-20T10:01:00.000Z', conversationIds: [], executionId,
        history: { completedAt: '2026-07-20T10:01:00.000Z', output: 'done', prompt: '', status: 'completed' },
        origin, rootActionId: 'implement', rootActionLabel: 'Implement', startedAt: '2026-07-20T10:00:00.000Z',
        status: 'completed',
    };
}

describe('card activity visibility', () => {
    it('shows valid worktree commits, hides discarded commits, retains merged commits, and marks missing objects', async () => {
        const parentPath = await mkdtemp(join(tmpdir(), 'md2-activity-visibility-'));
        const primaryPath = join(parentPath, 'primary');
        const linkedPath = join(parentPath, 'linked');
        const project = { branch: 'main', rootPath: primaryPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        try {
            await mkdir(primaryPath);
            await git(primaryPath, ['init', '-b', 'main']);
            await git(primaryPath, ['config', 'user.email', 'md2-test@example.com']);
            await git(primaryPath, ['config', 'user.name', 'MD2 Test']);
            await mkdir(join(primaryPath, 'design'));
            await writeFile(join(primaryPath, 'design', 'card.md'), 'Initial\n');
            await git(primaryPath, ['add', '.']);
            await git(primaryPath, ['commit', '-m', 'Initial']);
            const initialCommit = await git(primaryPath, ['rev-parse', 'HEAD']);
            await git(primaryPath, ['worktree', 'add', '-b', 'feature', linkedPath]);
            await writeFile(join(linkedPath, 'design', 'card.md'), 'Changed\n');
            await git(linkedPath, ['add', '.']);
            await git(linkedPath, ['commit', '-m', 'Card change']);
            const commit = await git(linkedPath, ['rev-parse', 'HEAD']);
            await appendActionActivity(project, 'design', origin, activityRecord('execution-1', [commitReference(commit)]));

            const worktrees = [{ branch: 'feature', path: linkedPath, valid: true }];
            expect((await loadCardActivity(project, 'design', 'card-1', worktrees)).records[0].commits)
                .toEqual([expect.objectContaining({ available: true, commit })]);
            expect((await loadCardActivity(project, 'design', 'card-1', [])).records[0].commits).toEqual([]);

            await git(primaryPath, ['worktree', 'remove', '--force', linkedPath]);
            await git(primaryPath, ['merge', '--no-ff', 'feature', '-m', 'Merge feature']);
            expect((await loadCardActivity(project, 'design', 'card-1', [])).records[0].commits)
                .toEqual([expect.objectContaining({ available: true, commit })]);

            await git(primaryPath, ['checkout', '-b', 'alternate', initialCommit]);
            expect((await loadCardActivity(project, 'design', 'card-1', [])).records[0].commits)
                .toEqual([expect.objectContaining({ available: true, commit })]);

            const missingCommit = 'f'.repeat(40);
            await appendActionActivity(project, 'design', origin, activityRecord('execution-2', [commitReference(missingCommit, 'main')]));
            expect((await loadCardActivity(project, 'design', 'card-1', [])).records[1].commits)
                .toEqual([expect.objectContaining({ available: false, commit: missingCommit })]);
        } finally {
            await rm(parentPath, { force: true, recursive: true });
        }
    }, 15000);
});

describe('project activity conversations', () => {
    it('lists conversation references without routing activity JSON through markdown loading', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-activity-'));
        const project = { branch: 'main', rootPath };
        try {
            await git(rootPath, ['init', '-b', 'main']);
            await git(rootPath, ['config', 'user.email', 'md2-test@example.com']);
            await git(rootPath, ['config', 'user.name', 'MD2 Test']);
            await upsertActivityConversation(project, 'design', { kind: 'project' }, {
                completedAt: '2026-07-21T10:01:00.000Z',
                events: [],
                id: 'conversation-1',
                messages: [],
                providerSessions: [],
                startedAt: '2026-07-21T10:00:00.000Z',
                status: 'completed',
                title: 'Project run',
            });

            await expect(listAgentConversationReferences(project, 'design')).resolves.toEqual([
                'design/activity/project.json#conversation=conversation-1',
            ]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
