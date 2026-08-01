import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownFile } from '../data/data_types'
import { configService } from './config/config_service'
import { createDataService, createStorage, files, storageFiles } from './test_support/data_service_test_support'

const RELEASE_STATES = [
    { alwaysVisible: true, state: 'active' },
    { alwaysVisible: true, state: 'done' },
]

describe('ReleaseOperations', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('completes a release under the configured project releases folder and refreshes the snapshot', async () => {
        configService.init()
        const finalColumnFile = {
            ...files[0],
            content: files[0].content.replace('status: active', 'status: done'),
            path: 'design/active/F-1-root.md',
        }
        const releaseFiles: MarkdownFile[] = [
            finalColumnFile,
            { content: '---\nid: F-2\ninternalId: imported-card\ntitle: Imported\nstatus: active\n---\n\n# Imported', path: 'design/active/F-2-imported.md' },
            files[1],
        ]
        const archivedFiles: MarkdownFile[] = [
            { content: finalColumnFile.content, path: 'design/releases/v1/F-1-root.md' },
            releaseFiles[1],
            files[1],
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValueOnce(['design/active/F-1-root.md', 'design/active/F-2-imported.md'])
                .mockResolvedValueOnce(['design/active/F-2-imported.md', 'design/releases/v1/F-1-root.md']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({
                archivedFolder: 'archived',
                backgroundShade: 'blue' as const,
                projectFolder: 'design',
                releasesFolder: 'releases',
                states: RELEASE_STATES,
                workingFolder: 'active',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles.slice(0, 2), workingFolder: 'design/active' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.releases.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: finalColumnFile.content,
                    fromPath: 'design/active/F-1-root.md',
                    sha: undefined,
                    toPath: 'design/releases/v1/F-1-root.md',
                },
            ],
        })
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        if (!snapshot) throw new Error('Expected release completion to return a snapshot')

        expect(snapshot.activeCards.map((card) => card.path)).toEqual(['design/active/F-2-imported.md'])
        expect(snapshot.backgroundCards.map((card) => card.path)).toContain('design/releases/v1/F-1-root.md')
    })

    it('loads referenced assets and includes them in the release move batch', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n\n# Root\n\n![note](note.png)', path: 'design/F-1-root.md' },
        ]
        const archivedFiles: MarkdownFile[] = [
            { content: releaseFiles[0].content, path: 'history/v1/F-1-root.md' },
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'design/note.png']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectAsset: vi.fn(async () => ({
                content: 'aW1hZ2U=',
                contentType: 'image/png',
                encoding: 'base64' as const,
                path: 'design/note.png',
            })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1')

        expect(storage.loadProjectAsset).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design/note.png')
        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: releaseFiles[0].content,
                    fromPath: 'design/F-1-root.md',
                    sha: undefined,
                    toPath: 'history/v1/F-1-root.md',
                },
                {
                    content: 'aW1hZ2U=',
                    encoding: 'base64',
                    fromPath: 'design/note.png',
                    sha: undefined,
                    toPath: 'history/v1/note.png',
                },
            ],
        })
    })

    it('rejects invalid release names before moving files', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('bad/name')).rejects.toThrow('Release name may contain only')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects release completion when the final column has no cards', async () => {
        configService.init()
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' }))})
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1')).rejects.toThrow('without cards in the final column: done')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects duplicate release folders before moving files', async () => {
        configService.init()
        const finalColumnFile = { ...files[0], content: files[0].content.replace('status: active', 'status: done') }
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'history/v1/F-9.md']),
            loadProject: vi.fn(async () => ({
                files: [finalColumnFile, ...storageFiles.slice(1), { content: '# Archived', path: 'history/v1/F-9.md' }],
                workingFolder: 'design',
            })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1')).rejects.toThrow('Release already exists: v1')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('leaves release completion unpushed in manual mode', async () => {
        configService.init()
        const finalColumnFile = { ...files[0], content: files[0].content.replace('status: active', 'status: done') }
        const archivedFiles: MarkdownFile[] = [{ content: finalColumnFile.content, path: 'history/v1/F-1-root.md' }]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: [finalColumnFile, ...storageFiles.slice(1)], workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({
                backgroundShade: 'blue' as const,
                projectFolder: '',
                pushMode: 'manual' as const,
                states: RELEASE_STATES,
                workingFolder: 'design',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })
})
