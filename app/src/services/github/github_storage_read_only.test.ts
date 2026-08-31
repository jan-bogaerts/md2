import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_CONFIG, type ProjectReference } from '../../data/data_types'
import { GithubStorageService } from './github_storage_service'

const project: ProjectReference = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }
const READ_ONLY_ERROR = 'Public GitHub repository is read-only'

function createRepositoryPayload(visibility: 'private' | 'public') {
    return {
        default_branch: 'main',
        full_name: 'owner/repo',
        name: 'repo',
        owner: { login: 'owner' },
        visibility,
    }
}

describe('GithubStorageService read-only mode', () => {
    it('accepts only repositories GitHub reports as public', async () => {
        const publicFetch = vi.fn(async () => Response.json(createRepositoryPayload('public')))
        const publicStorage = new GithubStorageService(true)
        publicStorage.init({ accessToken: 'token', fetchImplementation: publicFetch })

        await expect(publicStorage.findRepository('owner', 'repo')).resolves.toEqual(project)

        const privateFetch = vi.fn(async () => Response.json(createRepositoryPayload('private')))
        const privateStorage = new GithubStorageService(true)
        privateStorage.init({ accessToken: 'token', fetchImplementation: privateFetch })

        await expect(privateStorage.findRepository('owner', 'repo')).rejects.toThrow('GitHub repository is not public')
    })

    it('uses default config and empty missing folders without writing', async () => {
        const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
            const url = input.toString()
            if (url.includes('/contents/md2.config.json')) return new Response('', { status: 404 })
            if (url.includes('/git/ref/heads/main')) {
                return Response.json({ object: { sha: 'commit-1', type: 'commit' }, ref: 'refs/heads/main' })
            }
            if (url.includes('/git/commits/commit-1')) return Response.json({ sha: 'commit-1', tree: { sha: 'tree-1' } })
            if (url.includes('/git/trees/tree-1')) return Response.json({ tree: [], truncated: false })

            return new Response('{}', { status: 404 })
        })
        const storage = new GithubStorageService(true)
        storage.init({ accessToken: 'token', fetchImplementation })

        await expect(storage.loadProjectConfig(project)).resolves.toEqual(DEFAULT_PROJECT_CONFIG)
        await expect(storage.loadProjectRoot(project, 'design/active')).resolves.toEqual({ files: [], workingFolder: 'design/active' })
        await expect(storage.loadProject(project, 'design')).resolves.toEqual({ files: [], workingFolder: 'design' })
        await expect(storage.loadActionFiles(project, 'design/actions')).resolves.toEqual([])
        expect(fetchImplementation.mock.calls.every(([input]) => !input.toString().includes('/git/blobs'))).toBe(true)
    })

    it('fails every repository write entry point before making a request', async () => {
        const fetchImplementation = vi.fn()
        const storage = new GithubStorageService(true)
        storage.init({ accessToken: 'token', fetchImplementation })
        const writes = [
            () => storage.createProject(project, ['design/active']),
            () => storage.commit({ branch: 'main', files: [], message: 'write' }),
            () => storage.deleteFile({ branch: 'main', message: 'delete', path: 'file.md' }),
            () => storage.deleteFolder({ branch: 'main', message: 'delete', path: 'folder' }),
            () => storage.moveFiles({ branch: 'main', message: 'move', moves: [] }),
            () => storage.saveProjectConfig(project, DEFAULT_PROJECT_CONFIG),
            () => storage.push(project),
            () => storage.restorePendingCommits(project),
        ]

        for (const write of writes) await expect(write()).rejects.toThrow(READ_ONLY_ERROR)
        expect(() => storage.discardPendingCommits(project)).toThrow(READ_ONLY_ERROR)
        expect(fetchImplementation).not.toHaveBeenCalled()
    })
})
