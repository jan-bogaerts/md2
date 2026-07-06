import { describe, expect, it, vi } from 'vitest'
import { GithubStorageService } from './github_storage_service'

const encodedContent = btoa('# Root')
const project = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }

function createResponse(payload: unknown) {
    return {
        json: async () => payload,
        ok: true,
        status: 200,
    } as Response
}

function createStatusResponse(status: number) {
    return {
        json: async () => ({}),
        ok: status >= 200 && status < 300,
        status,
    } as Response
}

describe('GithubStorageService', () => {
    it('loads markdown files recursively from the selected branch', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([
                { path: 'design/F-1-root.md', type: 'file' },
                { path: 'design/history', type: 'dir' },
            ]))
            .mockResolvedValueOnce(createResponse({
                content: encodedContent,
                encoding: 'base64',
                path: 'design/F-1-root.md',
                sha: 'sha-1',
            }))
            .mockResolvedValueOnce(createResponse([
                { path: 'design/history/F-2-old.md', type: 'file' },
            ]))
            .mockResolvedValueOnce(createResponse({
                content: encodedContent,
                encoding: 'base64',
                path: 'design/history/F-2-old.md',
                sha: 'sha-2',
            }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const projectFiles = await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')

        expect(projectFiles.files.map((file) => file.path)).toEqual(['design/F-1-root.md', 'design/history/F-2-old.md'])
        expect(fetchImplementation.mock.calls[0][0]).toContain('/repos/owner/repo/contents/design?ref=main')
    })

    it('creates blobs, one tree, and one commit with the request message for a multi-file commit', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
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
        const treeCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/trees'))
        const commitCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/commits'))
        const patchCalls = fetchImplementation.mock.calls.filter(([, init]) => init.method === 'PATCH')

        expect(blobCalls).toHaveLength(2)
        expect(treeCalls).toHaveLength(1)
        expect(commitCalls).toHaveLength(2)
        expect(JSON.parse(treeCalls[0][1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'design/F-1-root.md', sha: 'blob-1', type: 'blob' },
                { mode: '100644', path: 'design/F-2-added.md', sha: 'blob-2', type: 'blob' },
            ],
        })
        expect(JSON.parse(commitCalls[1][1].body)).toEqual({
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
            .mockResolvedValueOnce(createResponse([]))
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
    })

    it('leaves the branch and pending head unchanged when building a later commit fails', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
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
            .mockResolvedValueOnce(createResponse([]))
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

        expect(fetchImplementation).toHaveBeenCalledTimes(4)
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/repos/owner/repo/git/blobs'))).toBe(false)
        expect(fetchImplementation.mock.calls.some(([url]) => url.includes('/repos/owner/repo/git/trees') && !url.includes('recursive=1'))).toBe(false)
        expect(fetchImplementation.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false)
    })

    it('supports auto behavior as commit followed by push', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
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
            .mockResolvedValueOnce(createResponse([]))
            .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
            .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } }))
            .mockResolvedValueOnce(createResponse({
                tree: [{ path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' }],
                truncated: false,
            }))
            .mockResolvedValueOnce(createResponse({ sha: 'blob-2' }))
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
            }],
        })

        const treeCall = fetchImplementation.mock.calls.find(([url, init]) => (
            url.includes('/repos/owner/repo/git/trees') && init.method === 'POST'
        ))
        const commitCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/commits'))

        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [
                { mode: '100644', path: 'design/history/v1/F-1-root.md', sha: 'blob-2', type: 'blob' },
                { mode: '100644', path: 'design/F-1-root.md', sha: null, type: 'blob' },
            ],
        })
        expect(JSON.parse(commitCalls[1][1].body)).toEqual({
            message: 'Complete release v1',
            parents: ['base-commit'],
            tree: 'new-tree',
        })
    })

    it('deletes files by creating one tree with a null sha and one commit', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
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
        const commitCalls = fetchImplementation.mock.calls.filter(([url]) => url.includes('/repos/owner/repo/git/commits'))

        expect(JSON.parse(treeCall?.[1].body)).toEqual({
            base_tree: 'base-tree',
            tree: [{ mode: '100644', path: 'design/F-1-root.md', sha: null, type: 'blob' }],
        })
        expect(JSON.parse(commitCalls[1][1].body)).toEqual({
            message: 'Delete obsolete card',
            parents: ['base-commit'],
            tree: 'new-tree',
        })
    })

    it('rejects GitHub deletion without a sha before calling the contents API', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject(project, 'design')
        await expect(service.deleteFile({
            branch: 'main',
            message: 'Delete obsolete card',
            path: 'design/F-1-root.md',
        })).rejects.toThrow('Cannot delete GitHub file without sha: design/F-1-root.md')
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
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
            .mockResolvedValueOnce(createResponse([
                { path: 'app', type: 'dir' },
                { path: 'README.md', type: 'file' },
            ]))
            .mockResolvedValueOnce(createResponse([
                { path: 'app/src', type: 'dir' },
            ]))
            .mockResolvedValueOnce(createResponse([
                { path: 'app/src/main.tsx', type: 'file' },
            ]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const files = await service.listRepositoryFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })

        expect(files).toEqual(['app/src/main.tsx', 'README.md'])
        expect(fetchImplementation.mock.calls[0][0]).toContain('/repos/owner/repo/contents?ref=main')
        expect(fetchImplementation.mock.calls[1][0]).toContain('/repos/owner/repo/contents/app?ref=main')
    })

    it('lists top-level folders from the repository root', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse([
            { name: 'app', path: 'app', type: 'dir' },
            { name: 'README.md', path: 'README.md', type: 'file' },
            { name: 'design', path: 'design', type: 'dir' },
        ]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const folders = await service.listTopLevelFolders({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })

        expect(folders).toEqual([{ name: 'app', path: 'app' }, { name: 'design', path: 'design' }])
        expect(fetchImplementation.mock.calls[0][0]).toContain('/repos/owner/repo/contents?ref=main')
    })

    it('throws a clear missing-folder error without creating content when loading a missing project folder', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createStatusResponse(404))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')).rejects.toMatchObject({
            code: 'missing-working-folder',
            message: 'Working folder is missing: design',
            workingFolder: 'design',
        })
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
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
            .mockResolvedValueOnce(createResponse([
                { path: 'actions/implement.json', type: 'file' },
                { path: 'actions/readme.md', type: 'file' },
            ]))
            .mockResolvedValueOnce(createResponse({
                content: btoa('{"name":"implement"}'),
                encoding: 'base64',
                path: 'actions/implement.json',
                sha: 'action-sha',
            }))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        const files = await service.loadActionFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'actions')

        expect(files).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }])
    })

    it('returns no action files when the actions folder is absent', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createStatusResponse(404))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.loadActionFiles({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'actions')).resolves.toEqual([])
    })
})
