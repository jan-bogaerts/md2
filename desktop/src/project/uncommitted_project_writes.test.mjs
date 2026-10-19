import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { UncommittedProjectWrites } = require('./uncommitted_project_writes');

function createWrites(commitTrackedPaths, pathExists = vi.fn(async () => true)) {
    return new UncommittedProjectWrites({ commitTrackedPaths, pathExists });
}

describe('UncommittedProjectWrites', () => {
    it('commits marked paths once and then clears them', async () => {
        const commitTrackedPaths = vi.fn(async () => 'commit');
        const writes = createWrites(commitTrackedPaths);
        writes.mark('C:/repo', ['C:/repo/design/activity/card__a.json', 'design/usage_metrics.csv']);
        writes.mark('C:/repo', ['design/activity/card__a.json']);

        await expect(writes.commit('C:/repo')).resolves.toBe('commit');
        await expect(writes.commit('C:/repo')).resolves.toBeNull();

        expect(commitTrackedPaths).toHaveBeenCalledTimes(1);
        expect(commitTrackedPaths).toHaveBeenCalledWith(
            'C:/repo',
            ['design/activity/card__a.json', 'design/usage_metrics.csv'],
            'Save pending project activity',
        );
    });

    it('keeps marked paths when the commit fails', async () => {
        const commitTrackedPaths = vi.fn()
            .mockRejectedValueOnce(new Error('index locked'))
            .mockResolvedValueOnce('commit');
        const writes = createWrites(commitTrackedPaths);
        writes.mark('C:/repo', ['design/a.json']);

        await expect(writes.commit('C:/repo')).rejects.toThrow('index locked');
        await expect(writes.commit('C:/repo')).resolves.toBe('commit');

        expect(commitTrackedPaths).toHaveBeenLastCalledWith('C:/repo', ['design/a.json'], 'Save pending project activity');
    });

    it('accepts already-clean paths without error', async () => {
        const commitTrackedPaths = vi.fn(async () => null);
        const writes = createWrites(commitTrackedPaths);
        writes.mark('C:/repo', ['design/a.json']);

        await expect(writes.commit('C:/repo')).resolves.toBeNull();
    });

    it('drops paths that no longer exist without committing them', async () => {
        const commitTrackedPaths = vi.fn(async () => 'commit');
        const pathExists = vi.fn(async (filePath) => !filePath.includes('deleted'));
        const writes = createWrites(commitTrackedPaths, pathExists);
        writes.mark('C:/repo', ['design/deleted.json', 'design/kept.json']);

        await writes.commit('C:/repo');
        await writes.commit('C:/repo');

        expect(commitTrackedPaths).toHaveBeenCalledTimes(1);
        expect(commitTrackedPaths).toHaveBeenCalledWith('C:/repo', ['design/kept.json'], 'Save pending project activity');
    });

    it('never commits paths marked for another repository root', async () => {
        const commitTrackedPaths = vi.fn(async () => 'commit');
        const writes = createWrites(commitTrackedPaths);
        writes.mark('C:/other', ['design/a.json']);

        await expect(writes.commit('C:/repo')).resolves.toBeNull();

        expect(commitTrackedPaths).not.toHaveBeenCalled();
    });
});
