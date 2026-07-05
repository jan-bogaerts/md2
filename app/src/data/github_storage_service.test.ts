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

    it('lists branches for repository selection', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(createResponse([{ name: 'main' }, { name: 'feature' }]))
        const service = new GithubStorageService()
        service.init({ accessToken: 'token', fetchImplementation })

        await expect(service.listBranches({ branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' })).resolves.toEqual([
            { name: 'main' },
            { name: 'feature' },
        ])
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
})
