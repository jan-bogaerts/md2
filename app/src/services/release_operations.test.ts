import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownFile } from '../data/data_types'
import { configService } from './config_service'
import { DataService } from './data_service'
import { createStorage, files, storageFiles } from './test_support/data_service_test_support'

describe('ReleaseOperations', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('completes a release by moving active cards to history and refreshing the snapshot', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            files[0],
            { content: '---\nid: F-2\ntitle: Imported\nstatus: active\n---\n\n# Imported', path: 'design/F-2-imported.md' },
            files[1],
        ]
        const archivedFiles: MarkdownFile[] = [
            { content: files[0].content, path: 'design/history/v1/F-1-root.md' },
            { content: releaseFiles[1].content, path: 'design/history/v1/F-2-imported.md' },
            { content: '# Old', path: 'design/history/F-3-old.md' },
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValueOnce(['design/F-1-root.md'])
                .mockResolvedValueOnce(['design/history/v1/F-1-root.md']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.releases.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: files[0].content,
                    fromPath: 'design/F-1-root.md',
                    sha: undefined,
                    toPath: 'design/history/v1/F-1-root.md',
                },
                {
                    content: releaseFiles[1].content,
                    fromPath: 'design/F-2-imported.md',
                    sha: undefined,
                    toPath: 'design/history/v1/F-2-imported.md',
                },
            ],
        })
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        if (!snapshot) throw new Error('Expected release completion to return a snapshot')

        expect(snapshot.activeCards).toHaveLength(0)
        expect(snapshot.backgroundCards.map((card) => card.path)).toContain('design/history/v1/F-1-root.md')
    })

    it('rejects invalid release names before moving files', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('bad/name')).rejects.toThrow('Release name may contain only')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects duplicate release folders before moving files', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({
                files: [...storageFiles, { content: '# Archived', path: 'design/history/v1/F-9.md' }],
                workingFolder: 'design',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1')).rejects.toThrow('Release already exists: v1')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('leaves release completion unpushed in manual mode', async () => {
        configService.init()
        const archivedFiles: MarkdownFile[] = [{ content: files[0].content, path: 'design/history/v1/F-1-root.md' }]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: storageFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })
})
