import { describe, expect, it } from 'vitest';
import { parseScheduleFile } from '../../../../shared/action_schedules.mjs';

function sequence(fields = {}) {
    return {
        actionCompleted: false, actionId: 'build', cardInternalIds: ['card-1'], createdAt: '2026-10-07T10:00:00Z',
        currentIndex: 0, currentRunId: null, failure: null, id: 'sequence-1', kind: 'sequence',
        readyState: 'ready', readyStateMet: false, status: 'pending', trigger: { type: 'now' }, ...fields,
    };
}

function progress() {
    return {
        baseCommit: 'base', checkoutPath: 'C:/checkout', childBranch: null, childBranches: [], childCommits: {},
        expectedBranch: 'parking', integrationCommit: null, phase: 'preparing-sequence', runId: null,
        sequenceBranch: 'md2/sequence/one', sourceCommit: null, sourceTree: null, targetCommit: null,
    };
}

describe('sequence schedule contract', () => {
    it('preserves existing unassigned schedules without adding branch behavior', () => {
        const stored = sequence();
        expect(parseScheduleFile({ schedules: [stored] }).schedules).toEqual([stored]);
    });

    it('retains worktree assignment and durable branch evidence across serialization', () => {
        const stored = sequence({ branchProgress: progress(), worktreeBranch: 'parking' });
        expect(parseScheduleFile(JSON.parse(JSON.stringify({ schedules: [stored] }))).schedules).toEqual([stored]);
    });

    it.each([
        { branchProgress: progress() },
        { worktreeBranch: '' },
        { branchProgress: { ...progress(), phase: 'unknown' }, worktreeBranch: 'parking' },
        { branchProgress: { ...progress(), checkoutPath: undefined }, worktreeBranch: 'parking' },
        { branchProgress: { ...progress(), childBranches: ['child', 'child'] }, worktreeBranch: 'parking' },
        { branchProgress: { ...progress(), childCommits: { unrelated: 'commit' } }, worktreeBranch: 'parking' },
    ])('rejects malformed sequence assignment or progress', (fields) => {
        expect(() => parseScheduleFile({ schedules: [sequence(fields)] })).toThrow();
    });
});
