import { describe, expect, it, vi } from 'vitest'
import { GithubStorageService } from './github_storage_service'

const encodedContent = btoa('# Root')

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

    it('writes files through the contents API with commit message and branch', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')
        await service.commit({
            branch: 'main',
            files: [{ content: '# Updated', path: 'design/F-1-root.md', sha: 'sha-1' }],
            message: 'Update root',
        })

        expect(fetchImplementation.mock.calls[1][0]).toContain('/repos/owner/repo/contents/design/F-1-root.md')
        expect(JSON.parse(fetchImplementation.mock.calls[1][1].body)).toMatchObject({
            branch: 'main',
            message: 'Update root',
            sha: 'sha-1',
        })
    })

    it('moves files by writing the target and deleting the source with sha', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
            .mockResolvedValueOnce(createResponse({}))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')
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

        expect(fetchImplementation.mock.calls[1][0]).toContain('/repos/owner/repo/contents/design/history/v1/F-1-root.md')
        expect(fetchImplementation.mock.calls[1][1].method).toBe('PUT')
        expect(fetchImplementation.mock.calls[2][0]).toContain('/repos/owner/repo/contents/design/F-1-root.md')
        expect(fetchImplementation.mock.calls[2][1].method).toBe('DELETE')
        expect(JSON.parse(fetchImplementation.mock.calls[2][1].body)).toMatchObject({
            branch: 'main',
            message: 'Complete release v1',
            sha: 'sha-1',
        })
    })

    it('deletes files through the contents API with commit message, branch, and sha', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
            .mockResolvedValueOnce(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')
        await service.deleteFile({
            branch: 'feature',
            message: 'Delete obsolete card',
            path: 'design/F-1-root.md',
            sha: 'sha-1',
        })

        expect(fetchImplementation.mock.calls[1][0]).toContain('/repos/owner/repo/contents/design/F-1-root.md')
        expect(fetchImplementation.mock.calls[1][1].method).toBe('DELETE')
        expect(JSON.parse(fetchImplementation.mock.calls[1][1].body)).toEqual({
            branch: 'feature',
            message: 'Delete obsolete card',
            sha: 'sha-1',
        })
    })

    it('rejects GitHub deletion without a sha before calling the contents API', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(createResponse([]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.loadProject({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')
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
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse({}))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await service.createWorkingFolderFromTemplate({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'design')

        expect(fetchImplementation.mock.calls[0][0]).toContain('/repos/owner/repo/contents/design/README.md')
        expect(fetchImplementation.mock.calls[0][1].method).toBe('PUT')
        expect(JSON.parse(fetchImplementation.mock.calls[0][1].body)).toMatchObject({
            branch: 'main',
            message: 'Create design workspace',
        })
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
