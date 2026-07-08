import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommitRequest, MarkdownFile, StorageService } from '../data/data_types'
import { configService } from './config_service'
import { DataService } from './data_service'
import { telemetryService } from './telemetry_service'
import { activeCardFile, createStorage } from './test_support/data_service_test_support'

describe('CardOperations', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('creates cards with commits and auto-pushes when configured', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Create design/F-4-new-card.md' }) as CommitRequest)
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('creates job and bug cards with the type-specific id prefix', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: '', title: 'New Job', type: 'job' })
        await service.cards.createCard({ body: '', title: 'New Bug', type: 'bug' })

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ path: 'design/J-1-new-job.md' })] }) as CommitRequest)
        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ path: 'design/B-1-new-bug.md' })] }) as CommitRequest)
    })

    it('emits usage events after project and card operations succeed', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.projectLoading.createProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(trackEvent).toHaveBeenCalledWith('create_project')
        expect(trackEvent).toHaveBeenCalledWith('open_project')
        expect(trackEvent).toHaveBeenCalledWith('create_card')

        trackEvent.mockRestore()
    })

    it('does not emit create card usage when persistence fails', async () => {
        configService.init()
        const storage = createStorage({
            commit: vi.fn(async () => {
                throw new Error('commit failed')
            }),
        })
        const service = new DataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        trackEvent.mockClear()

        await expect(service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' })).rejects.toThrow('commit failed')
        expect(trackEvent).not.toHaveBeenCalledWith('create_card')

        trackEvent.mockRestore()
    })

    it('leaves commits unpushed in manual mode', async () => {
        configService.init()
        const storage = createStorage({ loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })) })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('toggles a card policy flag and persists the change', async () => {
        configService.init()
        const policyFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ntitle: Root\nstatus: active\npolicy:\n  checkLinting: true\n---\n\n# Root', path: 'design/F-1-root.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: policyFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: policyFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.toggleCardPolicy('design/F-1-root.md', 'checkLinting')
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('checkLinting: false')
    })

    it('moves a card across columns writing only the affected cards', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: A\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/A-1-a.md' },
            { content: '---\nid: B\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/B-1-b.md' },
            { content: '---\nid: P\ninternalId: p\ntitle: P\nstatus: done\n---\n\n# P', path: 'design/P-1-p.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const updates = service.cards.moveCard('design/B-1-b.md', 'done', 1)
        await service.cards.flushPendingCommits()

        expect(updates).toContainEqual({ after: 'p', path: 'design/B-1-b.md', status: 'done' })
        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        const committedPaths = committed.files.map((file) => file.path)
        expect(committedPaths).toEqual(['design/B-1-b.md'])
        const movedContent = committed.files[0].content
        expect(movedContent).toContain('status: done')
        expect(movedContent).toContain('after: p')
    })

    it('repairs ordering after deleting a middle card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
            activeCardFile('c', { after: 'b', sha: 'sha-c' }),
        ]
        const refreshedFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('c', { after: 'a', sha: 'sha-c-next' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: refreshedFiles, workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.cards.deleteCard('design/B-1-b.md')

        const repairCommit = vi.mocked(storage.commit).mock.calls[0][0]
        expect(repairCommit).toMatchObject({ branch: 'main', message: 'Repair ordering after deleting design/B-1-b.md' })
        expect(repairCommit.files.map((file) => file.path)).toEqual(['design/C-1-c.md'])
        expect(repairCommit.files[0].content).toContain('after: a')
        expect(storage.deleteFile).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Delete design/B-1-b.md',
            path: 'design/B-1-b.md',
            sha: 'sha-b',
        })
        expect(vi.mocked(storage.commit).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.deleteFile).mock.invocationCallOrder[0],
        )
        expect(snapshot?.activeCards.map((card) => card.path)).toEqual(['design/A-1-a.md', 'design/C-1-c.md'])
    })

    it('does not repair ordering after deleting a tail card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.deleteCard('design/B-1-b.md')

        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'design/B-1-b.md', sha: 'sha-b' }))
    })

    it('leaves deleted files unpushed in manual mode', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.deleteCard('design/B-1-b.md')

        expect(storage.deleteFile).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('leaves the snapshot unchanged when storage delete fails', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            deleteFile: vi.fn(async () => {
                throw new Error('delete failed')
            }),
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const beforePaths = service.getState().snapshot?.activeCards.map((card) => card.path)

        await expect(service.cards.deleteCard('design/B-1-b.md')).rejects.toThrow('delete failed')

        expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(beforePaths)
        expect(storage.push).not.toHaveBeenCalled()
        expect(storage.loadProject).toHaveBeenCalledTimes(1)
    })

    it('flushes a pending body update before deleting a card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardBody('design/B-1-b.md', '# B\n\nEdited body')
        await service.cards.deleteCard('design/B-1-b.md')

        const updateCommit = vi.mocked(storage.commit).mock.calls[0][0]
        expect(updateCommit.files[0].path).toBe('design/B-1-b.md')
        expect(updateCommit.files[0].content).toContain('Edited body')
        expect(vi.mocked(storage.commit).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.deleteFile).mock.invocationCallOrder[0],
        )
    })

    it('edits a card title inline and persists it through the header', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('title: Renamed Root')
    })

    it('edits a header field while preserving unknown header fields unchanged', async () => {
        configService.init()
        const headerFiles: MarkdownFile[] = [{
            content: '---\ncustomField: keep me\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardHeaderFields('design/F-1-root.md', { status: 'ready' })
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toBe('---\ncustomField: keep me\nid: F-1\ntitle: Root\nstatus: ready\n---\n\n# Root')
    })

    it('preserves the frontmatter header when a card body is edited', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardBody('design/F-1-root.md', '\n# Root\n\nEdited body')
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content.startsWith('---\nid: F-1')).toBe(true)
        expect(committed.files[0].content).toContain('Edited body')
    })

    it('uses the committed sha from the first body update for the next body update', async () => {
        configService.init()
        const staleShaFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
            sha: 'sha-1',
        }]
        const commit = vi.fn(async (request: CommitRequest) => {
            const [file] = request.files
            if (!file) throw new Error('Expected commit file')

            return [{ ...file, sha: 'sha-2' }]
        })
        const storage = createStorage({
            commit,
            loadProject: vi.fn(async () => ({ files: staleShaFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: staleShaFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nFirst edit')
        await service.cards.flushPendingCommits()

        const snapshotCard = service.getState().snapshot?.activeCards[0]
        expect(snapshotCard?.sha).toBe('sha-2')

        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nSecond edit')
        await service.cards.flushPendingCommits()

        expect(commit).toHaveBeenCalledTimes(2)
        expect(commit.mock.calls[1][0].files[0].sha).toBe('sha-2')
    })

    it('updates card affects through the shared header rewrite and save flow', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardAffects('design/F-1-root.md', ['app/src/card.tsx'])
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('affects:\n  - app/src/card.tsx')
        expect(committed.files[0].content).not.toContain('app/src/app.tsx')
        expect(committed.files[0].content.endsWith('\n\n# Root')).toBe(true)
    })

    it('reports commit flush failures and keeps pending edits for retry', async () => {
        configService.init()
        const error = new Error('network down')
        const commit = vi.fn<StorageService['commit']>(async () => {
            throw error
        })
        const storage = createStorage({ commit })
        const service = new DataService()
        const errors: string[] = []
        const handleWorkspaceError = (event: Event) => {
            errors.push((event as CustomEvent<string>).detail)
        }
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        window.addEventListener('md2:workspace-error', handleWorkspaceError)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')

            await expect(service.cards.flushPendingCommits()).rejects.toThrow('network down')

            expect(errors).toContain('network down')
            expect(captureError).toHaveBeenCalledWith(error)
            expect(service.getState().hasPendingCommits).toBe(true)

            commit.mockImplementation(async (request) => request.files)
            await service.cards.flushPendingCommits()

            expect(service.getState().hasPendingCommits).toBe(false)
            expect(commit).toHaveBeenCalledTimes(2)
        } finally {
            window.removeEventListener('md2:workspace-error', handleWorkspaceError)
        }
    })
})
