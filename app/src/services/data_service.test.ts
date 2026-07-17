import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubUnauthorizedError } from '../auth/github_api_client'
import { configService } from './config_service'
import { DataService } from './data_service'
import { GithubStorageService } from './github_storage_service'
import {
    createGithubRawResponse,
    createGithubResponse,
    createGithubStatusResponse,
    createDeferred,
    createStorage,
    files,
    githubProject,
} from './test_support/data_service_test_support'

describe('DataService', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('handles GitHub unauthorized once when opening a project gets a 401', async () => {
        configService.init()
        const handleUnauthorized = vi.fn()
        const githubStorage = new GithubStorageService()
        githubStorage.init({
            accessToken: 'token',
            fetchImplementation: vi.fn().mockResolvedValue(createGithubStatusResponse(401)),
            onUnauthorized: handleUnauthorized,
        })
        const service = new DataService()
        service.init({ storage: githubStorage })

        await expect(service.projectLoading.openProject(githubProject)).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('reports direct action persistence through the shared pending-save state', async () => {
        configService.init()
        const pendingCommit = createDeferred<never[]>()
        const storage = createStorage({ commit: vi.fn(() => pendingCommit.promise) })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const pendingStates: boolean[] = []
        service.addEventListener('changed', () => pendingStates.push(service.getState().hasPendingSave))

        const save = service.persistActionFile({ content: '{}', path: 'actions/review.json' })
        expect(service.getState().hasPendingSave).toBe(true)

        pendingCommit.resolve([])
        await save
        expect(service.getState().hasPendingSave).toBe(false)
        expect(pendingStates).toContain(true)
        expect(pendingStates.at(-1)).toBe(false)
    })

    it('handles GitHub unauthorized once when a batched commit gets a 401', async () => {
        configService.init()
        const handleUnauthorized = vi.fn()
        const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const url = String(input)
            if (url.includes('/contents/md2.config.json')) {
                return createGithubResponse({
                    content: btoa(JSON.stringify({ backgroundShade: 'blue', projectFolder: '', workingFolder: 'design' })),
                    encoding: 'base64',
                    path: 'md2.config.json',
                    sha: 'config-sha',
                })
            }
            if (url.includes('/git/ref/heads/main')) {
                return createGithubResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' })
            }
            if (url.includes('/git/commits/base-commit')) {
                return createGithubResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } })
            }
            if (url.includes('/git/trees/base-tree')) {
                return createGithubResponse({
                    tree: [{ path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' }],
                    truncated: false,
                })
            }
            if (url.includes('/git/blobs/sha-1') && init.method !== 'POST') return createGithubRawResponse(files[0].content)
            if (url.includes('/git/blobs') && init.method === 'POST') return createGithubStatusResponse(401)

            return createGithubResponse([])
        })
        const githubStorage = new GithubStorageService()
        githubStorage.init({ accessToken: 'token', fetchImplementation, onUnauthorized: handleUnauthorized })
        const service = new DataService()
        service.init({ storage: githubStorage })

        await service.projectLoading.openProject(githubProject)
        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nChanged')

        await expect(service.cards.flushPendingCommits()).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('imports Remarkable images into an existing card and commits card, assets and metadata together', async () => {
        configService.init()
        const storage = createStorage()
        const remarkableBridge = {
            importFiles: vi.fn(async () => [
                { content: btoa('img'), modifiedTime: '2026-07-01T10:00:00.000Z', name: 'note.png', sourcePath: '/img/note.png' },
            ]),
            listImageFiles: vi.fn(async () => []),
            testConnection: vi.fn(async () => ({ message: null, ok: true })),
        }
        const service = new DataService()
        service.init({ remarkableBridge, storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const plan = await service.importRemarkableImages({
            paths: ['/img/note.png'],
            settings: { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' },
            target: { cardPath: 'design/F-1-root.md', kind: 'existing' },
        })

        expect(remarkableBridge.importFiles).toHaveBeenCalledWith(expect.objectContaining({ paths: ['/img/note.png'] }))
        const commitRequest = vi.mocked(storage.commit).mock.calls[0][0]
        expect(commitRequest.files.map((file) => file.path)).toEqual([
            'design/F-1-root.md',
            'design/note.png',
            'design/.remarkable-import.json',
        ])
        expect(commitRequest.files[1].encoding).toBe('base64')
        expect(plan.importedAssetPaths).toEqual(['design/note.png'])
        expect(storage.push).toHaveBeenCalled()
    })

    it('rejects Remarkable import when no bridge is available', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.importRemarkableImages({
            paths: ['/img/note.png'],
            settings: { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' },
            target: { cardPath: 'design/F-1-root.md', kind: 'existing' },
        })).rejects.toThrow(/Electron local mode/u)

        expect(storage.commit).not.toHaveBeenCalled()
    })

})
