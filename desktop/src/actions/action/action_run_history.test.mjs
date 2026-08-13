import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    captureCommitReferences,
    createAgentDetails,
    createCommandDetails,
} = require('./action_run_history');

const action = { id: 'main', label: 'Implement', type: 'command' };
const completedAt = '2026-07-15T10:00:00.000Z';
const project = { branch: 'worktree', rootPath: 'C:/worktree' };

describe('history entries', () => {
    it('preserves command output and status without commit ownership', () => {
        const result = { command: 'test', exitCode: 1, stderr: 'err', stdout: 'out' };

        expect(createCommandDetails({ action, completedAt, result })).toEqual({command: 'test', output: 'outerr', type: 'command'});
    });

    it('preserves agent fields without commit ownership', () => {
        const result = {
            agent: 'codex', exitCode: 0, model: 'gpt', permissionMode: 'ask-for-approval',
            prompt: 'review', stderr: '', stdout: 'done', thinkingLevel: 'high',
        };

        expect(createAgentDetails({ action, completedAt, result })).toEqual({agent: 'codex', model: 'gpt', permissionMode: 'ask-for-approval', thinkingLevel: 'high', type: 'agent'});
    });
});

describe('captureCommitReferences', () => {
    it('resolves all command summaries with performer and repository metadata', async () => {
        const result = { exitCode: 0, stderr: '[topic bbbbbbb] second', stdout: '[topic aaaaaaa] first\n' };
        const localGitService = {
            resolveCommitMetadata: vi.fn(async (_rootPath, commit) => ({
                commit: commit.repeat(6).slice(0, 40),
                committedAt: commit === 'aaaaaaa' ? '2026-07-15T09:00:00+00:00' : '2026-07-15T10:00:00+00:00',
                deletions: 2,
                filePaths: [`${commit}.md`],
                filesChanged: 1,
                insertions: 4,
            })),
        };

        const references = await captureCommitReferences(localGitService, { action, project, result });

        expect(references).toHaveLength(2);
        expect(references[0]).toEqual({
            actionId: 'main', actionName: 'Implement', branch: 'topic', commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            committedAt: '2026-07-15T09:00:00+00:00', deletions: 2, filePaths: ['aaaaaaa.md'], filesChanged: 1,
            insertions: 4, repositoryRoot: 'C:/worktree',
        });
    });

    it('uses tracked commit hash and run worktree metadata', async () => {
        const trackedAction = { ...action, trackFileChanges: true, type: 'agent' };
        const result = { stderr: '', stdout: '[wrong wrong12] ignored', trackedCommit: 'abcdef3' };
        const localGitService = {
            resolveCommitMetadata: vi.fn(async () => ({
                commit: 'abcdef3456789012345678901234567890123456', committedAt: completedAt, deletions: 0,
                filePaths: ['app/a.ts'], filesChanged: 1, insertions: 3,
            })),
        };

        await expect(captureCommitReferences(localGitService, { action: trackedAction, project, result })).resolves.toEqual([{
            actionId: 'main', actionName: 'Implement', branch: 'worktree', commit: 'abcdef3456789012345678901234567890123456',
            committedAt: completedAt, deletions: 0, filePaths: ['app/a.ts'], filesChanged: 1, insertions: 3,
            repositoryRoot: 'C:/worktree',
        }]);
    });

    it('resolves multiple agent stdout markers in first-seen order', async () => {
        const untrackedAgent = { ...action, type: 'agent' };
        const result = { stderr: '', stdout: 'First Commit: abc1234\nprose\nSecond Commit: def5678' };
        const localGitService = {
            resolveCommitMetadata: vi.fn(async (_rootPath, commit) => ({
                commit: commit.padEnd(40, commit.at(-1)), committedAt: completedAt, deletions: 0,
                filePaths: [`${commit}.md`], filesChanged: 1, insertions: 1,
            })),
        };

        const references = await captureCommitReferences(localGitService, { action: untrackedAgent, project, result });

        expect(references.map(({ branch, commit }) => ({branch, commit}))).toEqual([
            { branch: 'worktree', commit: 'abc1234444444444444444444444444444444444' },
            { branch: 'worktree', commit: 'def5678888888888888888888888888888888888' },
        ]);
        expect(localGitService.resolveCommitMetadata).toHaveBeenNthCalledWith(1, 'C:/worktree', 'abc1234');
        expect(localGitService.resolveCommitMetadata).toHaveBeenNthCalledWith(2, 'C:/worktree', 'def5678');
    });

    it('ignores command summaries, malformed markers, and stderr markers in agent output', async () => {
        const untrackedAgent = { ...action, type: 'agent' };
        const result = {
            stderr: 'Commit: abc1234',
            stdout: '[main abc1234] command summary\ncommit: def5678\nCommit: bad-id',
        };
        const localGitService = { resolveCommitMetadata: vi.fn() };

        await expect(captureCommitReferences(localGitService, { action: untrackedAgent, project, result })).resolves.toEqual([]);
        expect(localGitService.resolveCommitMetadata).not.toHaveBeenCalled();
    });

    it('resolves tracked commit before repeated reported commits for run-scoped deduplication', async () => {
        const trackedAction = { ...action, trackFileChanges: true, type: 'agent' };
        const result = { stderr: '', stdout: 'Commit: abc1234\nCommit: abc1234', trackedCommit: 'abc1234' };
        const localGitService = {
            resolveCommitMetadata: vi.fn(async () => ({
                commit: 'abc1234567890123456789012345678901234567', committedAt: completedAt, deletions: 0,
                filePaths: ['app/a.ts'], filesChanged: 1, insertions: 1,
            })),
        };

        const references = await captureCommitReferences(localGitService, { action: trackedAction, project, result });

        expect(references).toHaveLength(3);
        expect(references.every(({ commit }) => commit === 'abc1234567890123456789012345678901234567')).toBe(true);
        expect(localGitService.resolveCommitMetadata).toHaveBeenCalledTimes(3);
    });

    it('propagates required Git metadata failure', async () => {
        const localGitService = { resolveCommitMetadata: vi.fn(async () => { throw new Error('unknown commit'); }) };
        const agentAction = { ...action, type: 'agent' };
        const result = { stderr: '', stdout: 'Commit: abcdef1' };

        await expect(captureCommitReferences(localGitService, { action: agentAction, project, result })).rejects.toThrow('unknown commit');
    });
});
