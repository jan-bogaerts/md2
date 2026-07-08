import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubPendingCommitConflictError, GithubStorageService } from '../services/github_storage_service'

const project = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }
const EXPECTED_GITHUB_CONCURRENCY_LIMIT = 8
const GITHUB_CONCURRENCY_TEST_FILE_COUNT = 10

function createResponse(payload: unknown) {
    return {
        json: async () => payload,
        ok: true,
        status: 200,
    } as Response
}

function createRawResponse(content: string) {
    return {
        ok: true,
        status: 200,
        text: async () => content,
    } as Response
}

function createStatusResponse(status: number) {
    return {
        json: async () => ({}),
        ok: status >= 200 && status < 300,
        status,
    } as Response
}

function queueProjectTree(fetchImplementation: ReturnType<typeof vi.fn>, entries: unknown[], treeSha = 'base-tree') {
    fetchImplementation
        .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
        .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: treeSha } }))
        .mockResolvedValueOnce(createResponse({ tree: entries, truncated: false }))
}

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

    it('creates blobs, one tree, and one commit with the request message for a multi-file commit', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-2' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        const updatedFiles = await service.commit({
            branch: 'main',
            files: [
                { content: '# Updated', path: 'design/F-1-root.md' },
                { content: '# Added', path: 'design/F-2-added.md' },
            ],
            message: 'Update design files',
        })

        const blobCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/blobs'))
        const treeCalls = fetchImplementation.mock.calls.filter(([url, init]) => url.includes('/repos/owner/repo/git/trees') && init.method === 'POST')
        const commitCalls = fetchImplementation.mock.calls.filter(([url, init]) => url.includes('/repos/owner/repo/git/commits') && init.method === 'POST')
        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')

        expect(blobCalls).toHaveLength(2)
        expect(treeCalls).toHaveLength(1)
        expect(commitCalls).toHaveLength(1)
        expect(JSON.parse(treeCalls[0][1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'design/F-1-root.md', sha: 'blob-1', type: 'blob' },
                { mode: '100644', path: 'design/F-2-added.md', sha: 'blob-2', type: 'blob' },
            ],
        })
        expect(JSON.parse(commitCalls[0][1].body)).toEqual({
            message: 'Update design files',
            parents: ['base-commit'],
            tree: 'new-tree',
        })
        expect(patchCalls).toHaveLength(0)
        expect(updatedFiles).toEqual([
            { content: '# Updated', path: 'design/F-1-root.md', sha: 'blob-1' },
            { content: '# Added', path: 'design/F-2-added.md', sha: 'blob-2' },
        ])
    })

    it('pushes the pending commit to the branch ref', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md' }],
            message: 'Update root',
        })
        await service.push(project)

        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')

        expect(patchCalls).toHaveLength(1)
        expect(patchCalls[0][0]).toContain('/repos/owner/repo/git/refs/heads/main')
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'pending-commit' })
        expect(service.hasPendingCommits(project)).toBe(false)
        expect(window.localStorage.getItem('md2.github.pendingCommitHeads')).toBeNull()
    })

    it('persists pending heads and restores them after service recreation', async () => {
        const firstFetchImplementation = vi.fn()
        queueProjectTree(firstFetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        firstFetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const firstService = new GithubStorageService()
        firstService.init({ accessToken: 'token', fetchImplementation: firstFetchImplementation })

        await firstService.loadProject(project, 'design')
        await firstService.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md' }],
            message: 'Update root',
        })

        expect(JSON.parse(window.localStorage.getItem('md2.github.pendingCommitHeads') ?? '{}')).toEqual({'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit' }})

        const secondFetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
            .mockResolvedValueOnce(createResponse({}))
        const secondService = new GithubStorageService()
        secondService.init({ accessToken: 'token', fetchImplementation: secondFetchImplementation })

        await secondService.restorePendingCommits(project)
        expect(secondService.hasPendingCommits(project)).toBe(true)

        await secondService.push(project)

        const patchCalls = secondFetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCalls).toHaveLength(1)
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'pending-commit' })
    })

    it('reads restored pending content after reload and commits later edits without a false remote-change error', async () => {
        const firstFetchImplementation = vi.fn()
        queueProjectTree(firstFetchImplementation, [{ path: 'design/F-1-root.md', sha: 'base-file-sha', type: 'blob' }])
        firstFetchImplementation
            .mockResolvedValueOnce(createRawResponse('# Original'))
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'base-file-sha', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'updated-file-sha' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
        const firstService = new GithubStorageService()
        firstService.init({ accessToken: 'token', fetchImplementation: firstFetchImplementation })

        await firstService.loadProjectRoot(project, 'design')
        await firstService.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md', sha: 'base-file-sha' }],
            message: 'Update root',
        })

        const secondFetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [
                    { path: 'actions', sha: 'actions-tree', type: 'tree' },
                    { path: 'actions/implement.json', sha: 'action-sha', type: 'blob' },
                    { path: 'design/F-1-root.md', sha: 'updated-file-sha', type: 'blob' },
                    { path: 'docs', sha: 'docs-tree', type: 'tree' },
                ],
                truncated: false,
            }))
            .mockResolvedValueOnce(createRawResponse('# Updated'))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createRawResponse('{"name":"implement"}'))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'updated-file-sha', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'second-file-sha' }))
            .mockResolvedValueOnce(createResponse({ sha: 'second-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'second-pending-commit', tree: { sha: 'second-tree' } }))
        const secondService = new GithubStorageService()
        secondService.init({ accessToken: 'token', fetchImplementation: secondFetchImplementation })

        await secondService.restorePendingCommits(project)
        const projectFiles = await secondService.loadProjectRoot(project, 'design')
        const repositoryFiles = await secondService.listRepositoryFiles(project)
        const folders = await secondService.listTopLevelFolders(project)
        const actionFiles = await secondService.loadActionFiles(project, 'actions')
        await secondService.commit({
            branch: 'main',
            files: [{ content: '# Updated again', path: 'design/F-1-root.md', sha: 'updated-file-sha' }],
            message: 'Update root again',
        })

        expect(projectFiles.files).toEqual([{ content: '# Updated', path: 'design/F-1-root.md', sha: 'updated-file-sha' }])
        expect(repositoryFiles).toEqual(['actions/implement.json', 'design/F-1-root.md'])
        expect(folders).toEqual([{ name: 'actions', path: 'actions' }, { name: 'docs', path: 'docs' }])
        expect(actionFiles).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }])
        expect(JSON.parse(window.localStorage.getItem('md2.github.pendingCommitHeads') ?? '{}')).toEqual({'owner/repo:main': { baseSha: 'base-commit', headSha: 'second-pending-commit' }})
    })

    it('loads the same content after pushing a restored pending head and reloading', async () => {
        window.localStorage.setItem('md2.github.pendingCommitHeads', JSON.stringify({'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit' }}))
        const firstFetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'updated-file-sha', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createRawResponse('# Updated'))
            .mockResolvedValueOnce(createResponse({}))
        const firstService = new GithubStorageService()
        firstService.init({ accessToken: 'token', fetchImplementation: firstFetchImplementation })

        await firstService.restorePendingCommits(project)
        const pendingProjectFiles = await firstService.loadProjectRoot(project, 'design')
        await firstService.push(project)

        const secondFetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'pending-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'pending-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'updated-file-sha', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createRawResponse('# Updated'))
        const secondService = new GithubStorageService()
        secondService.init({ accessToken: 'token', fetchImplementation: secondFetchImplementation })

        const pushedProjectFiles = await secondService.loadProjectRoot(project, 'design')

        expect(pendingProjectFiles).toEqual(pushedProjectFiles)
        expect(window.localStorage.getItem('md2.github.pendingCommitHeads')).toBeNull()
    })

    it('uses a restored pending head as the parent for later commits', async () => {
        window.localStorage.setItem('md2.github.pendingCommitHeads', JSON.stringify({'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit-1' }}))
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit-1', tree: { sha: 'tree-1' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit-1', tree: { sha: 'tree-1' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-2' }))
            .mockResolvedValueOnce(createResponse({ sha: 'tree-2' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit-2', tree: { sha: 'tree-2' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.restorePendingCommits(project)
        await service.commit({
            branch: 'main',
            files: [{ content: '# Second', path: 'design/F-2-added.md' }],
            message: 'Second pending commit',
        })

        const commitCalls = fetchImplementation.mock.calls.filter(([url, init]) => url.includes('/repos/owner/repo/git/commits') && init.method === 'POST')
        expect(JSON.parse(commitCalls[0][1].body)).toEqual({
            message: 'Second pending commit',
            parents: ['pending-commit-1'],
            tree: 'tree-2',
        })
        expect(JSON.parse(window.localStorage.getItem('md2.github.pendingCommitHeads') ?? '{}')).toEqual({'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit-2' }})
    })

    it('raises a pending conflict when the remote branch moved before restore', async () => {
        window.localStorage.setItem('md2.github.pendingCommitHeads', JSON.stringify({'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit' }}))
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'remote-commit', type: 'commit' }, ref: 'refs/heads/main' }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.restorePendingCommits(project)).rejects.toBeInstanceOf(GithubPendingCommitConflictError)
        expect(service.hasPendingCommits(project)).toBe(true)
        expect(fetchImplementation.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false)
    })

    it('discards stored pending commits for one project only', async () => {
        window.localStorage.setItem('md2.github.pendingCommitHeads', JSON.stringify({
            'owner/other:main': { baseSha: 'other-base', headSha: 'other-head' },
            'owner/repo:main': { baseSha: 'base-commit', headSha: 'pending-commit' },
        }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation: vi.fn() })

        service.discardPendingCommits(project)

        expect(service.hasPendingCommits(project)).toBe(false)
        expect(JSON.parse(window.localStorage.getItem('md2.github.pendingCommitHeads') ?? '{}')).toEqual({'owner/other:main': { baseSha: 'other-base', headSha: 'other-head' }})
    })

    it('keeps pending heads when switching projects', async () => {
        const otherProject = { branch: 'main', id: 'owner/other', owner: 'owner', repository: 'other' }
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md' }],
            message: 'Update root',
        })
        await service.loadProject(otherProject, 'design')
        await service.push(project)

        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCalls).toHaveLength(1)
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'pending-commit' })
    })

    it('leaves the branch and pending head unchanged when building a later commit fails', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'tree-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit-1', tree: { sha: 'tree-1' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit-1', tree: { sha: 'tree-1' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-2' }))
            .mockResolvedValueOnce(createStatusResponse(500))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.commit({
            branch: 'main',
            files: [{ content: '# First', path: 'design/F-1-root.md' }],
            message: 'First pending commit',
        })
        await expect(service.commit({
            branch: 'main',
            files: [{ content: '# Second', path: 'design/F-2-added.md' }],
            message: 'Second pending commit',
        })).rejects.toThrow('GitHub storage request failed with status 500')

        const patchCallsBeforePush = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCallsBeforePush).toHaveLength(0)

        await service.push(project)

        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCalls).toHaveLength(1)
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'pending-commit-1' })
    })

    it('throws a clear remote-change error before writing when the recursive tree sha is stale', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'remote-sha', type: 'blob' }],
                truncated: false,
            }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await expect(service.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md', sha: 'stale-sha' }],
            message: 'Update root',
        })).rejects.toThrow(/changed remotely.*Reload or refresh/u)

        expect(fetchImplementation).toHaveBeenCalledTimes(6)
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/repos/owner/repo/git/blobs'))).toBe(false)
        expect(fetchImplementation.mock.calls.some(([url, init]) => url.includes('/repos/owner/repo/git/trees') && init.method === 'POST')).toBe(false)
        expect(fetchImplementation.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false)
    })

    it('supports auto behavior as commit followed by push', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'auto-commit', tree: { sha: 'new-tree' } }))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md' }],
            message: 'Auto update root',
        })
        await service.push(project)

        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')

        expect(patchCalls).toHaveLength(1)
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'auto-commit' })
    })

    it('moves files by creating a blob, one tree with target and source changes, and one commit', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [
                    { path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' },
                    { path: 'design/note.png', sha: 'sha-2', type: 'blob' },
                ],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-2' }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-3' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.moveFiles({
            branch: 'main',
            message: 'Complete release v1',
            moves: [{
                content: '# Root',
                fromPath: 'design/F-1-root.md',
                sha: 'sha-1',
                toPath: 'design/history/v1/F-1-root.md',
            }, {
                content: 'aW1hZ2U=',
                encoding: 'base64',
                fromPath: 'design/note.png',
                sha: 'sha-2',
                toPath: 'design/history/v1/note.png',
            }],
        })

        const blobCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/blobs'))
        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        const commitCalls = fetchImplementation.mock.calls.filter(([url, init]) => url.includes('/repos/owner/repo/git/commits') && init.method === 'POST')

        expect(JSON.parse(blobCalls[1][1].body)).toEqual({ content: 'aW1hZ2U=', encoding: 'base64' })
        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'design/history/v1/F-1-root.md', sha: 'blob-2', type: 'blob' },
                { mode: '100644', path: 'design/F-1-root.md', sha: null, type: 'blob' },
                { mode: '100644', path: 'design/history/v1/note.png', sha: 'blob-3', type: 'blob' },
                { mode: '100644', path: 'design/note.png', sha: null, type: 'blob' },
            ],
        })
        expect(JSON.parse(commitCalls[0][1].body)).toEqual({
            message: 'Complete release v1',
            parents: ['base-commit'],
            tree: 'new-tree',
        })
    })

    it('deletes files by creating one tree with a null sha and one commit', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/feature' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.deleteFile({
            branch: 'feature',
            message: 'Delete obsolete card',
            path: 'design/F-1-root.md',
            sha: 'sha-1',
        })

        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        const commitCalls = fetchImplementation.mock.calls.filter(([url, init]) => url.includes('/repos/owner/repo/git/commits') && init.method === 'POST')

        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [{ mode: '100644', path: 'design/F-1-root.md', sha: null, type: 'blob' }],
        })
        expect(JSON.parse(commitCalls[0][1].body)).toEqual({
            message: 'Delete obsolete card',
            parents: ['base-commit'],
            tree: 'new-tree',
        })
    })

    it('rejects GitHub deletion without a sha before calling the contents API', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await expect(service.deleteFile({
            branch: 'main',
            message: 'Delete obsolete card',
            path: 'design/F-1-root.md',
        })).rejects.toThrow('Cannot delete GitHub file without sha: design/F-1-root.md')
        expect(fetchImplementation).toHaveBeenCalledTimes(3)
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

        await expect(service.listBranches(project)).rejects.toThrow('GitHub storage request failed with status 500')
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

    it('creates template content only through explicit working-folder creation', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-1' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.createWorkingFolderFromTemplate(project, 'design')

        const blobCall = fetchImplementation.mock.calls.find(([url]) => url.includes('/repos/owner/repo/git/blobs'))
        const commitCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/commits'))

        expect(JSON.parse(blobCall?.[1].body)).toEqual({
            content: '# MD2\n\nProject design folder created by MD2.\n',
            encoding: 'utf-8',
        })
        expect(JSON.parse(commitCalls[1][1].body)).toMatchObject({ message: 'Create design workspace' })
    })

    it('loads project config from the repository root', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse({
            content: btoa(JSON.stringify({ pushMode: 'manual', workingFolder: 'docs' })),
            encoding: 'base64',
            path: 'md2.config.json',
            sha: 'config-sha',
        }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadProjectConfig({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })).resolves.toEqual({
            pushMode: 'manual',
            workingFolder: 'docs',
        })
    })

    it('returns null when project config is absent', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createStatusResponse(404))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadProjectConfig({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })).resolves.toBeNull()
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
