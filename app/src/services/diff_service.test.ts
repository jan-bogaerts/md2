import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitReference } from '../data/electron_action_bridge'

const generateDiffBridge = vi.fn()

vi.mock('../data/electron_action_bridge', () => ({getElectronActionBridge: () => ({ generateDiff: generateDiffBridge })}))

vi.mock('./config_service', () => ({configService: { get: () => 'git show {{commit}}' }}))

const { generateDiff } = await import('./diff_service')

const commitReference: CommitReference = {
    actionId: 'action-1', actionName: 'Implement', branch: 'topic', commit: 'abc123456789',
    committedAt: '2026-07-15T10:00:00+00:00', filePaths: ['app/a.ts'], repositoryRoot: 'C:/worktree',
}

describe('generateDiff', () => {
    beforeEach(() => generateDiffBridge.mockReset())

    it('requests diff using selected commit reference metadata', async () => {
        generateDiffBridge.mockResolvedValue({ commit: commitReference.commit, files: [] })

        await generateDiff(commitReference)

        expect(generateDiffBridge).toHaveBeenCalledWith({
            branch: 'topic', commit: 'abc123456789', filePath: 'app/a.ts',
            repositoryRoot: 'C:/worktree', template: 'git show {{commit}}',
        })
    })
})
