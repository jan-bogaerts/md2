import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubPendingCommitConflictError, GithubStorageService } from './github_storage_service'
import { createRawResponse, createResponse, createStatusResponse, project, queueProjectTree } from '../test_support/github_storage_test_support'

describe('GithubStorageService', () => {
    beforeEach(() => {
        window.localStorage.clear()
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
        expect(service.hasPendingPush(project)).toBe(false)
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
        expect(secondService.hasPendingPush(project)).toBe(true)

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
        expect(service.hasPendingPush(project)).toBe(true)
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

        expect(service.hasPendingPush(project)).toBe(false)
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
        })).rejects.toThrow('GitHub storage request failed with status 500 for POST /repos/owner/repo/git/trees')

        const patchCallsBeforePush = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCallsBeforePush).toHaveLength(0)

        await service.push(project)

        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')
        expect(patchCalls).toHaveLength(1)
        expect(JSON.parse(patchCalls[0][1].body)).toEqual({ force: false, sha: 'pending-commit-1' })
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

})
