import { describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../data/data_types';
import { createDeferred, createStorage } from '../test_support/data_service_test_support';
import { EXPECTED_PERSISTENCE_OUTCOME_LIMIT, ExpectedPersistenceOutcomes } from './expected_persistence_outcomes';
import { withExpectedPersistenceOutcomes } from './expected_persistence_storage';

function createTrackedStorage(storage: StorageService, repositoryFiles: string[] = []) {
    const outcomes = new ExpectedPersistenceOutcomes();
    const verifyRetainedOutcomes = vi.fn();
    const trackedStorage = withExpectedPersistenceOutcomes(storage, {
        outcomes,
        project: () => ({ branch: 'main', id: 'project' }),
        repositoryFiles: () => repositoryFiles,
        verifyRetainedOutcomes,
    });

    return { outcomes, trackedStorage, verifyRetainedOutcomes };
}

describe('withExpectedPersistenceOutcomes', () => {
    it('registers writes and moves before commit and settles them after success', async () => {
        const commit = createDeferred<never[]>();
        const storage = createStorage({ commit: vi.fn(() => commit.promise), watchProject: vi.fn() });
        const { outcomes, trackedStorage } = createTrackedStorage(storage);
        const request = {
            branch: 'main',
            files: [{ content: 'written', path: 'design\\written.md' }],
            message: 'write and move',
            moves: [{ content: 'moved', fromPath: 'design/old.md', toPath: 'design/new.md' }],
        };

        const pendingCommit = trackedStorage.commit(request);

        expect(outcomes.getExpected('design/written.md')).toEqual({ content: 'written', kind: 'present', path: 'design/written.md' });
        expect(outcomes.getExpected('design/old.md')).toEqual({ kind: 'absent', path: 'design/old.md' });
        expect(outcomes.getExpected('design/new.md')).toEqual({ content: 'moved', kind: 'present', path: 'design/new.md' });
        expect(outcomes.classify({ content: 'written', kind: 'present', path: 'design/written.md' })).toBe('pending');

        commit.resolve([]);
        await pendingCommit;
        expect(outcomes.classify({ content: 'written', kind: 'present', path: 'design/written.md' })).toBe('matched');
    });

    it('retains registered outcomes when storage fails', async () => {
        const storage = createStorage({
            deleteFile: vi.fn(async () => {
                throw new Error('disk unavailable');
            }),
            watchProject: vi.fn(),
        });
        const { outcomes, trackedStorage } = createTrackedStorage(storage);

        await expect(trackedStorage.deleteFile({ branch: 'main', message: 'delete', path: 'design/card.md' }))
            .rejects.toThrow('disk unavailable');

        expect(outcomes.getExpected('design/card.md')).toEqual({ kind: 'absent', path: 'design/card.md' });
        expect(outcomes.classify({ kind: 'absent', path: 'design/card.md' })).toBe('matched');
    });

    it('expands folder deletion to known repository descendants', async () => {
        const storage = createStorage({ watchProject: vi.fn() });
        const { outcomes, trackedStorage } = createTrackedStorage(storage, [
            'design/notes/one.md',
            'design/notes/nested/two.md',
            'design/other.md',
        ]);

        await trackedStorage.deleteFolder({ branch: 'main', message: 'delete folder', path: 'design\\notes' });

        expect(outcomes.getExpected('design/notes/one.md')).toEqual({ kind: 'absent', path: 'design/notes/one.md' });
        expect(outcomes.getExpected('design/notes/nested/two.md')).toEqual({ kind: 'absent', path: 'design/notes/nested/two.md' });
        expect(outcomes.getExpected('design/other.md')).toBeNull();
    });

    it('does not register outcomes without a watcher or for an inactive branch', async () => {
        const storage = createStorage();
        const { outcomes, trackedStorage } = createTrackedStorage(storage);

        await trackedStorage.commit({ branch: 'other', files: [{ content: 'other', path: 'other.md' }], message: 'other' });
        await trackedStorage.commit({ branch: 'main', files: [{ content: 'main', path: 'main.md' }], message: 'main' });

        expect(outcomes.retainedOutcomeCount).toBe(0);
    });

    it('verifies retained outcomes before accepting state beyond the bound', async () => {
        const storage = createStorage({ watchProject: vi.fn() });
        const { outcomes, trackedStorage, verifyRetainedOutcomes } = createTrackedStorage(storage);
        const retainedOutcomes = Array.from(
            { length: EXPECTED_PERSISTENCE_OUTCOME_LIMIT },
            (_, index) => ({ content: String(index), kind: 'present' as const, path: `design/${index}.md` }),
        );
        outcomes.registerOperation(retainedOutcomes);
        verifyRetainedOutcomes.mockImplementation(async () => outcomes.reset());

        await trackedStorage.commit({
            branch: 'main',
            files: [{ content: 'next', path: 'design/next.md' }],
            message: 'next',
        });

        expect(verifyRetainedOutcomes).toHaveBeenCalledOnce();
        expect(outcomes.retainedOutcomeCount).toBe(1);
    });
});
