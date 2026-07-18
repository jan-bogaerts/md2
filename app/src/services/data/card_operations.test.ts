import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommitRequest, MarkdownFile, StorageService } from '../../data/data_types'
import { configService } from '../config/config_service'
import { DataService } from './data_service'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage, type DialogSeverity } from '.././dialog_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { activeCardFile, createStorage, storageFiles } from '.././test_support/data_service_test_support'

function recordDialogMessages(severity: DialogSeverity) {
    const messages: string[] = []
    const handleDialogMessage = (event: Event) => {
        const message = (event as CustomEvent<DialogServiceMessage>).detail
        if (message.severity === severity) messages.push(message.message)
    }
    dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage)

    return {
        messages,
        stop: () => dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage),
    }
}

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

    it('creates a Markdown file in the requested project-tree folder', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', workingFolder: 'active' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design/active' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const file = await service.cards.createMarkdownFile('design/notes', 'meeting-notes')

        expect(file).toEqual({ content: '', path: 'design/notes/meeting-notes.md' })
        expect(storage.commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [file],
            message: 'Create design/notes/meeting-notes.md',
        })
        expect(service.getState().snapshot?.backgroundCards.some((card) => card.path === file.path)).toBe(true)
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('creates a physical folder through a committed placeholder and reloads repository paths', async () => {
        configService.init()
        let folderCreated = false
        const commit = vi.fn<StorageService['commit']>(async () => {
            folderCreated = true
            return []
        })
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => (
                folderCreated ? ['design/notes/.gitkeep'] : ['design/active/F-1-root.md']
            )),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', workingFolder: 'active' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design/active' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const folderPath = await service.cards.createFolder('design', 'notes')

        expect(folderPath).toBe('design/notes')
        expect(commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [{ content: '', path: 'design/notes/.gitkeep' }],
            message: 'Create design/notes',
        })
        expect(service.getState().snapshot?.repositoryFiles).toContain('design/notes/.gitkeep')
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('deletes a folder recursively and reloads repository paths', async () => {
        configService.init()
        let folderDeleted = false
        const deleteFolder = vi.fn<StorageService['deleteFolder']>(async () => {
            folderDeleted = true
        })
        const storage = createStorage({
            deleteFolder,
            listRepositoryFiles: vi.fn(async () => (
                folderDeleted
                    ? ['design/active/F-1-root.md']
                    : ['design/active/F-1-root.md', 'design/notes/.gitkeep', 'design/notes/nested/info.txt']
            )),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', workingFolder: 'active' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design/active' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.projectLoading.reloadCurrentProjectSnapshot()
        await service.cards.deleteFolder('design/notes')

        expect(deleteFolder).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Delete design/notes',
            path: 'design/notes',
        })
        expect(service.getState().snapshot?.repositoryFiles).toEqual(['design/active/F-1-root.md'])
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('keeps a created card when auto-push fails after the commit succeeds', async () => {
        configService.init()
        const pushError = new Error('GitHub denied write access')
        const storage = createStorage({
            push: vi.fn(async () => {
                throw pushError
            }),
        })
        const service = new DataService()
        const errors = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            const file = await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

            expect(file.path).toBe('design/F-4-new-card.md')
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === file.path)).toBe(true)
            expect(errors.messages).toContain(
                'Card created locally, but GitHub push failed. Use Push after resolving the GitHub access problem. GitHub denied write access',
            )
            expect(captureError).toHaveBeenCalledWith(pushError)
            expect(trackEvent).toHaveBeenCalledWith('create_card')
        } finally {
            captureError.mockRestore()
            trackEvent.mockRestore()
            errors.stop()
        }
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
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', pushMode: 'manual' as const, workingFolder: 'design' }))})
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

    it('toggles a legacy-cased policy flag as enabled and persists canonical false', async () => {
        configService.init()
        const policyFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ntitle: Root\nstatus: active\npolicy:\n  checkLinting: True\n---\n\n# Root', path: 'design/F-1-root.md' },
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
        expect(committed.files[0].content).not.toContain('checkLinting: True')
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

    it('keeps the window receiver when scheduling a card move', async () => {
        configService.init()
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(function mockSetTimeout(this: Window) {
            if (this !== window) throw new TypeError('Illegal invocation')

            return 1 as unknown as ReturnType<typeof window.setTimeout>
        })
        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(function mockClearTimeout(this: Window) {
            if (this !== window) throw new TypeError('Illegal invocation')
        })
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: A\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/A-1-a.md' },
            { content: '---\nid: B\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/B-1-b.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(() => service.cards.moveCard('design/B-1-b.md', 'todo', 0)).not.toThrow()
            await service.cards.flushPendingCommits()
        } finally {
            setTimeoutSpy.mockRestore()
            clearTimeoutSpy.mockRestore()
        }
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
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', pushMode: 'manual' as const, workingFolder: 'design' })),
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
        expect(committed.files[0].content).toContain('# Renamed Root')
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

    it('does not rebuild, dispatch, or commit when saved content is unchanged', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.repositoryFiles).toHaveLength(3))
        const snapshot = service.getState().snapshot
        const handleChanged = vi.fn()
        service.addEventListener('changed', handleChanged)

        service.cards.saveFile(storageFiles[0])
        await service.cards.flushPendingCommits()

        expect(service.getState().snapshot).toBe(snapshot)
        expect(handleChanged).not.toHaveBeenCalled()
        expect(storage.commit).not.toHaveBeenCalled()
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
        const errors = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')

            await expect(service.cards.flushPendingCommits()).rejects.toThrow('network down')

            expect(errors.messages).toContain('network down')
            expect(captureError).toHaveBeenCalledWith(error)
            expect(service.getState().hasPendingSave).toBe(true)

            commit.mockImplementation(async (request) => request.files)
            await service.cards.flushPendingCommits()

            expect(service.getState().hasPendingSave).toBe(false)
            expect(commit).toHaveBeenCalledTimes(2)
        } finally {
            errors.stop()
        }
    })
})
