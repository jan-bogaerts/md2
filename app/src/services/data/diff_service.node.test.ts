import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitReference } from '../../data/electron_action_bridge'

const generateDiffBridge = vi.fn()

vi.mock('../../data/electron_action_bridge', () => ({getElectronActionBridge: () => ({ generateDiff: generateDiffBridge })}))

const { generateDiff, generateFileDiff } = await import('./diff_service')

const commitReference: CommitReference = {
    actionId: 'action-1', actionName: 'Implement', branch: 'topic', commit: 'abc123456789',
    committedAt: '2026-07-15T10:00:00+00:00', deletions: 0, filePaths: ['app/a.ts'], filesChanged: 1,
    insertions: 1, repositoryRoot: 'C:/worktree',
}

describe('generateDiff', () => {
    beforeEach(() => generateDiffBridge.mockReset())

    it('requests the full commit without a file path', async () => {
        generateDiffBridge.mockResolvedValue({ commit: commitReference.commit, files: [], patch: '' })

        await generateDiff(commitReference)

        expect(generateDiffBridge).toHaveBeenCalledWith({ commit: 'abc123456789' })
    })
})

describe('generateFileDiff', () => {
    beforeEach(() => generateDiffBridge.mockReset())

    it('requests only the selected repository path of the commit', async () => {
        generateDiffBridge.mockResolvedValue({ commit: commitReference.commit, files: [], patch: '' })

        await generateFileDiff('abc123456789', 'app/b.ts')

        expect(generateDiffBridge).toHaveBeenCalledWith({ commit: 'abc123456789', filePath: 'app/b.ts' })
    })
})
