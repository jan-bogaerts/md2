import { describe, expect, it, vi } from 'vitest'
import type { GithubStorageContext } from './github_storage_context'
import type { GithubStorageGitData } from './github_storage_git_data'
import { GithubStorageWriter } from './github_storage_writer'

describe('GithubStorageWriter', () => {
    it('rejects commit-only paths before reading the branch', async () => {
        const getBranchHead = vi.fn()
        const gitData = { getBranchHead } as unknown as GithubStorageGitData
        const writer = new GithubStorageWriter({} as GithubStorageContext, gitData)
        const request = { branch: 'main', files: [], message: 'Update conversation view state', paths: ['design/activity/card__card-1.json'] }

        await expect(writer.commit(request)).rejects.toThrow('Commit-only paths require a local Git bridge')
        expect(getBranchHead).not.toHaveBeenCalled()
    })
})
