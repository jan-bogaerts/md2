import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubStorageService } from './github_storage_service'
import {
    EXPECTED_GITHUB_CONCURRENCY_LIMIT,
    GITHUB_CONCURRENCY_TEST_FILE_COUNT,
    createRawResponse,
    createResponse,
    createStatusResponse,
    project,
    queueProjectTree,
} from '../test_support/github_storage_test_support'
import { conversation } from '../test_support/data_service_test_support'

describe('GithubStorageService', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('loads markdown files recursively from the selected branch', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' },
            { path: 'design/history', sha: 'tree-1', type: 'tree' },
            { path: 'design/history/F-2-old.md', sha: 'sha-2', type: 'blob' },
        ])
        fetchImplementation
            .mockResolvedValueOnce(createRawResponse('# Root'))
            .mockResolvedValueOnce(createRawResponse('# Root'))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const projectFiles = await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')

        expect(projectFiles.files.map((file) => file.path)).toEqual(['design/F-1-root.md', 'design/history/F-2-old.md'])
        expect(fetchImplementation.mock.calls[2][0]).toContain('/repos/owner/repo/git/trees/base-tree?recursive=1')
    })

    it('loads only root markdown files without recursing into subfolders', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' },
            { path: 'design/history', sha: 'tree-1', type: 'tree' },
            { path: 'design/history/F-2-old.md', sha: 'sha-2', type: 'blob' },
        ])
        fetchImplementation.mockResolvedValueOnce(createRawResponse('# Root'))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const projectFiles = await service.loadProjectRoot(project, 'design')

        expect(projectFiles.files.map((file) => file.path)).toEqual(['design/F-1-root.md'])
        expect(fetchImplementation).toHaveBeenCalledTimes(4)
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/git/blobs/sha-2'))).toBe(false)
    })

    it('excludes working-folder root blobs while retaining nested project files', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'design/active/F-1-root.md', sha: 'sha-root', type: 'blob' },
            { path: 'design/active/nested/F-2-nested.md', sha: 'sha-nested', type: 'blob' },
            { path: 'design/history/F-3-old.md', sha: 'sha-old', type: 'blob' },
        ])
        fetchImplementation
            .mockResolvedValueOnce(createRawResponse('# Nested'))
            .mockResolvedValueOnce(createRawResponse('# Old'))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const projectFiles = await service.loadProject(project, 'design', 'design/active')

        expect(projectFiles.files.map((file) => file.path)).toEqual([
            'design/active/nested/F-2-nested.md',
            'design/history/F-3-old.md',
        ])
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/git/blobs/sha-root'))).toBe(false)
    })

    it('loads a UTF-8 repository text file by path', async () => {
        const path = 'design/activity/card__card-1.json'
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse({
            content: btoa('{"version":2}'),
            encoding: 'base64',
            path,
            sha: 'activity-sha',
        }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadTextFile(project, path)).resolves.toEqual({
            content: '{"version":2}',
            path,
            sha: 'activity-sha',
        })
    })

    it('loads every conversation from one activity file in stored order', async () => {
        const path = 'design/activity/card__card-1.json'
        const first = { ...conversation(`${path}#conversation=conversation-1`), cardInternalId: 'different-card' }
        const second = { ...conversation(`${path}#conversation=conversation-2`), cardInternalId: 'different-card', id: 'conversation-2' }
        const storedFirst = Object.fromEntries(Object.entries(first).filter(([fieldName]) => fieldName !== 'path'))
        const storedSecond = Object.fromEntries(Object.entries(second).filter(([fieldName]) => fieldName !== 'path'))
        const activity = {
            actionSettings: {},
            conversations: [storedFirst, storedSecond],
            origin: { cardInternalId: 'different-card', kind: 'card' },
            records: [],
            version: 4,
        }
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse({
            content: btoa(JSON.stringify(activity)),
            encoding: 'base64',
            path,
            sha: 'activity-sha',
        }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const loaded = await service.loadActivityConversations(project, path)

        expect(loaded.map(({ id }) => id)).toEqual(['agent-1', 'conversation-2'])
        expect(loaded.map((item) => item.path)).toEqual([
            `${path}#conversation=agent-1`,
            `${path}#conversation=conversation-2`,
        ])
    })

    it('bounds parallel markdown content requests when loading a project', async () => {
        let activeBlobRequests = 0
        let maxActiveBlobRequests = 0
        const treeEntries = Array.from({ length: GITHUB_CONCURRENCY_TEST_FILE_COUNT }, (_item, index) => ({
            path: `design/F-${index}-file.md`,
            sha: `sha-${index}`,
            type: 'blob',
        }))
        const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/git/ref/heads/main')) {
                return createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' })
            }
            if (url.includes('/git/commits/base-commit')) return createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } })
            if (url.includes('/git/trees/base-tree')) return createResponse({ tree: treeEntries, truncated: false })
            if (url.includes('/git/blobs/')) {
                activeBlobRequests += 1
                maxActiveBlobRequests = Math.max(maxActiveBlobRequests, activeBlobRequests)
                await new Promise((resolve) => {
                    window.setTimeout(resolve, 0)
                })
                activeBlobRequests -= 1

                return createRawResponse('# File')
            }

            return createStatusResponse(404)
        })
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')

        expect(maxActiveBlobRequests).toBeGreaterThan(1)
        expect(maxActiveBlobRequests).toBeLessThanOrEqual(EXPECTED_GITHUB_CONCURRENCY_LIMIT)
    })

    it('lists branches for repository selection', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse([{ name: 'main' }, { name: 'feature' }]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.listBranches({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })).resolves.toEqual([
            { name: 'main' },
            { name: 'feature' },
        ])
    })

    it('keeps non-401 request failures surfaced as storage errors', async () => {
        const handleUnauthorized = vi.fn()
        const fetchImplementation = vi.fn().mockResolvedValue(createStatusResponse(500))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation, onUnauthorized: handleUnauthorized })

        await expect(service.listBranches(project)).rejects.toThrow(
            'GitHub storage request failed with status 500 for GET /repos/owner/repo/branches',
        )
        expect(handleUnauthorized).not.toHaveBeenCalled()
    })

    it('lists authenticated user repositories across pages with default branches', async () => {
        const firstPage = Array.from({ length: 100 }, (_item, index) => ({
            default_branch: `branch-${index}`,
            full_name: `owner/repo-${index}`,
            name: `repo-${index}`,
            owner: { login: 'owner' },
        }))
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse(firstPage))
            .mockResolvedValueOnce(createResponse([{
                default_branch: 'trunk',
                full_name: 'other/final',
                name: 'final',
                owner: { login: 'other' },
            }]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const repositories = await service.listRepositories()

        expect(repositories).toHaveLength(101)
        expect(repositories[0]).toMatchObject({ branch: 'branch-0', id: 'owner/repo-0', owner: 'owner', repository: 'repo-0' })
        expect(repositories[100]).toMatchObject({ branch: 'trunk', id: 'other/final', owner: 'other', repository: 'final' })
        expect(fetchImplementation.mock.calls[0][0]).toContain('/user/repos?per_page=100&page=1')
        expect(fetchImplementation.mock.calls[1][0]).toContain('/user/repos?per_page=100&page=2')
    })

    it('lists repository files recursively as repo-relative paths', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'app', sha: 'app-tree', type: 'tree' },
            { path: 'README.md', sha: 'readme-sha', type: 'blob' },
            { path: 'app/src', sha: 'src-tree', type: 'tree' },
            { path: 'app/src/main.tsx', sha: 'main-sha', type: 'blob' },
        ])
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const files = await service.listRepositoryFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })

        expect(files).toEqual(['app/src/main.tsx', 'README.md'])
        expect(fetchImplementation.mock.calls[2][0]).toContain('/repos/owner/repo/git/trees/base-tree?recursive=1')
    })

    it('lists top-level folders from the repository root', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'app', sha: 'app-tree', type: 'tree' },
            { path: 'README.md', sha: 'readme-sha', type: 'blob' },
            { path: 'app/src', sha: 'src-tree', type: 'tree' },
            { path: 'design', sha: 'design-tree', type: 'tree' },
        ])
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const folders = await service.listTopLevelFolders({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })

        expect(folders).toEqual([{ name: 'app', path: 'app' }, { name: 'design', path: 'design' }])
        expect(fetchImplementation.mock.calls[2][0]).toContain('/repos/owner/repo/git/trees/base-tree?recursive=1')
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/repos/owner/repo/contents'))).toBe(false)
    })

    it('throws a clear missing-folder error without creating content when loading a missing project folder', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'README.md', sha: 'readme-sha', type: 'blob' }])
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')).rejects.toMatchObject({
            code: 'missing-working-folder',
            message: 'Working folder is missing: design',
            workingFolder: 'design',
        })
        expect(fetchImplementation).toHaveBeenCalledTimes(3)
        expect(fetchImplementation.mock.calls[0][1].method).toBeUndefined()
    })

    it('loads json action files from the actions folder', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'actions/implement.json', sha: 'action-sha', type: 'blob' },
            { path: 'actions/readme.md', sha: 'readme-sha', type: 'blob' },
        ])
        fetchImplementation.mockResolvedValueOnce(createRawResponse('{"name":"implement"}'))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const files = await service.loadActionFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'actions')

        expect(files).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }])
    })

    it('returns no action files when the actions folder is absent', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'README.md', sha: 'readme-sha', type: 'blob' }])
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadActionFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'actions')).resolves.toEqual([])
    })
})
