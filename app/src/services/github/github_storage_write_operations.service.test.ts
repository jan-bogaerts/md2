import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubStorageService } from './github_storage_service'
import {
    createResponse,
    project,
    queueProjectTree,
} from '../test_support/github_storage_test_support'

describe('GithubStorageService', () => {
    beforeEach(() => {
        window.localStorage.clear()
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

    it('writes path-change target without deleting a missing source', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'actions', sha: 'actions-tree', type: 'tree' },
            { path: 'design', sha: 'design-tree', type: 'tree' },
        ])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({ tree: [], truncated: false }))
            .mockResolvedValueOnce(createResponse({ sha: 'action-blob' }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        const updatedFiles = await service.commit({
            branch: 'main',
            files: [],
            message: 'Rename action',
            moves: [{
                content: '{"label":"Review code"}',
                fromPath: 'actions/new-action.json',
                toPath: 'actions/review-code.json',
            }],
        })

        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'actions/review-code.json', sha: 'action-blob', type: 'blob' },
            ],
        })
        expect(updatedFiles).toEqual([{
            content: '{"label":"Review code"}',
            path: 'actions/review-code.json',
            sha: 'action-blob',
        }])
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

    it('resolves the current GitHub file when deletion has no loaded sha', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [{ path: 'design', sha: 'design-tree', type: 'tree' }])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/actions/test.json', sha: 'action-sha', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await service.deleteFile({
            branch: 'main',
            message: 'Delete action',
            path: 'design/actions/test.json',
        })

        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [{ mode: '100644', path: 'design/actions/test.json', sha: null, type: 'blob' }],
        })
    })

    it('deletes every file under a folder in one tree and commit', async () => {
        const fetchImplementation = vi.fn()
        queueProjectTree(fetchImplementation, [
            { path: 'design/notes', sha: 'notes-tree', type: 'tree' },
            { path: 'design/notes/.gitkeep', sha: 'sha-1', type: 'blob' },
            { path: 'design/notes/nested/info.txt', sha: 'sha-2', type: 'blob' },
            { path: 'design/other.md', sha: 'sha-3', type: 'blob' },
        ])
        fetchImplementation
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [
                    { path: 'design/notes/.gitkeep', sha: 'sha-1', type: 'blob' },
                    { path: 'design/notes/nested/info.txt', sha: 'sha-2', type: 'blob' },
                    { path: 'design/other.md', sha: 'sha-3', type: 'blob' },
                ],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'new-tree' }))
            .mockResolvedValueOnce(createResponse({ sha: 'pending-commit', tree: { sha: 'new-tree' } }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.listRepositoryFiles(project)
        await service.deleteFolder({ branch: 'main', message: 'Delete design/notes', path: 'design/notes' })

        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'design/notes/.gitkeep', sha: null, type: 'blob' },
                { mode: '100644', path: 'design/notes/nested/info.txt', sha: null, type: 'blob' },
            ],
        })
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

        await service.createProject(project, ['design'])

        const blobCall = fetchImplementation.mock.calls.find(([url]) => url.includes('/repos/owner/repo/git/blobs'))
        const commitCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/commits'))

        expect(JSON.parse(blobCall?.[1].body)).toEqual({
            content: '# MD²\n\nProject design folder created by MD².\n',
            encoding: 'utf-8',
        })
        expect(JSON.parse(commitCalls[1][1].body)).toMatchObject({ message: 'Create design workspace' })
    })

})
