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
            accessLevel: 'workspace-write', agent: 'codex', approvalPolicy: 'on-request', exitCode: 0,
            model: 'gpt', prompt: 'review', stderr: '', stdout: 'done', thinkingLevel: 'high',
        };

        expect(createAgentDetails({ action, completedAt, result })).toEqual({
            accessLevel: 'workspace-write', agent: 'codex', approvalPolicy: 'on-request',
            model: 'gpt', thinkingLevel: 'high', type: 'agent',
        });
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

    it('never parses commit summaries from untracked agent output', async () => {
        const untrackedAgent = { ...action, type: 'agent' };
        const result = { stderr: '', stdout: '[main abc1234] text that only mentions a commit' };
        const localGitService = { resolveCommitMetadata: vi.fn() };

        await expect(captureCommitReferences(localGitService, { action: untrackedAgent, project, result })).resolves.toEqual([]);
        expect(localGitService.resolveCommitMetadata).not.toHaveBeenCalled();
    });

    it('propagates required Git metadata failure', async () => {
        const localGitService = { resolveCommitMetadata: vi.fn(async () => { throw new Error('unknown commit'); }) };
        const result = { stderr: '', stdout: '[topic abcdef1] commit' };

        await expect(captureCommitReferences(localGitService, { action, project, result })).rejects.toThrow('unknown commit');
    });
});
