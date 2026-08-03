import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderByAfter } from '../../data/card_ordering'
import type { CommitRequest, MarkdownFile, ProjectSnapshot, StorageService } from '../../data/data_types'
import { configService } from '../config/config_service'
import { projectPersistenceService } from '../project/project_persistence_service'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage, type DialogSeverity } from '.././dialog_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { activeCardFile, createDataService, createStorage } from '.././test_support/data_service_test_support'
import { openFilesService } from '../open_files_service'
import { actionService } from '../actions/action_service'
import {
    CARD_ADDED_EVENT,
    CARD_CHANGED_EVENT,
    CARD_REMOVED_EVENT,
    type CardAddedEventDetail,
    type CardChangedEventDetail,
    type CardRemovedEventDetail,
} from './data_service'

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

function createMovePersistenceStorage(initialFiles: MarkdownFile[]) {
    let persistedFiles = initialFiles
    const commit = vi.fn<StorageService['commit']>(async (request) => {
        const committedFilesByPath = new Map(request.files.map((file) => [file.path, file]))
        persistedFiles = persistedFiles.map((file) => committedFilesByPath.get(file.path) ?? file)

        return request.files
    })
    const loadPersistedFiles = async () => ({ files: persistedFiles, workingFolder: 'design' })
    const storage = createStorage({
        commit,
        loadProject: vi.fn(loadPersistedFiles),
        loadProjectRoot: vi.fn(loadPersistedFiles),
    })

    return { commit, storage }
}

function orderedInternalIds(snapshot: ProjectSnapshot | null, status: string) {
    const cards = snapshot?.activeCards.filter((card) => card.header.status === status) ?? []

    return orderByAfter(cards).map((card) => card.header.internalId)
}

describe('CardOperations', () => {
    afterEach(() => {
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('adds and persists a missing card internal ID during project load', async () => {
        configService.init()
        const legacyFile = {
            content: '---\nid: F-1\ntitle: Legacy\nstatus: todo\n---\n\n# Legacy',
            path: 'design/F-1-legacy.md',
        }
        const storage = createStorage({loadProjectRoot: vi.fn(async () => ({ files: [legacyFile], workingFolder: 'design' }))})
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].header.internalId).toEqual(expect.any(String))
        expect(service.getPersistenceSnapshot().hasPendingFileCommit).toBe(false)
        expect(service.getState().snapshot?.activeCards[0].header.internalId).toBe(snapshot.activeCards[0].header.internalId)
        expect(storage.commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [expect.objectContaining({ content: expect.stringContaining('internalId:'), path: legacyFile.path })],
            message: 'Add missing card internal IDs',
        })
    })

    it('leaves markdown files outside the working folder root untouched during project load', async () => {
        configService.init()
        const plainFiles = [
            { content: '# Notes', path: 'design/architecture/notes.md' },
            { content: '---\ntitle: Old\n---\n\n# Old', path: 'design/history/F-3-old.md' },
        ]
        const storage = createStorage({ loadProjectRoot: vi.fn(async () => ({ files: plainFiles, workingFolder: 'design' })) })
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.backgroundCards.map(({ header }) => header.internalId)).toEqual([null, null])
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('creates cards with commits and auto-pushes when configured', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Create design/F-4-new-card.md' }) as CommitRequest)
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('emits card lifecycle events for create, update, and delete actions', async () => {
        configService.init()
        const service = createDataService()
        service.init({ storage: createStorage() })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const added = vi.fn()
        const changed = vi.fn()
        const removed = vi.fn()
        service.addEventListener(CARD_ADDED_EVENT, added)
        service.addEventListener(CARD_CHANGED_EVENT, changed)
        service.addEventListener(CARD_REMOVED_EVENT, removed)

        const file = await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')
        const renamedFile = await service.cards.updateCardTitle(file.path, 'Renamed Card')
        await service.cards.deleteCard(renamedFile.path)

        const addedDetails = added.mock.calls.map(([event]) => (event as CustomEvent<CardAddedEventDetail>).detail)
        const changedDetails = changed.mock.calls.map(([event]) => (event as CustomEvent<CardChangedEventDetail>).detail)
        const removedDetails = removed.mock.calls.map(([event]) => (event as CustomEvent<CardRemovedEventDetail>).detail)
        expect(addedDetails.some(({ card }) => card.path === file.path)).toBe(true)
        expect(changedDetails.some(({ card }) => card.path === file.path && card.header.title === 'Renamed Card')).toBe(true)
        expect(removedDetails.some(({ card }) => card.path === file.path)).toBe(true)
    })

    it('creates a Markdown file in the requested project-tree folder', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', workingFolder: 'active' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design/active' })),
        })
        const service = createDataService()
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
        const service = createDataService()
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
        const service = createDataService()
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
        const service = createDataService()
        const errors = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            const file = await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')

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
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: '', title: 'New Job', type: 'job' }, 'new')
        await service.cards.createCard({ body: '', title: 'New Bug', type: 'bug' }, 'new')

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ path: 'design/J-1-new-job.md' })] }) as CommitRequest)
        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ path: 'design/B-1-new-bug.md' })] }) as CommitRequest)
    })

    it('creates a card in the requested initial state', async () => {
        configService.init()
        const service = createDataService()
        service.init({ storage: createStorage() })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const file = await service.cards.createCard({ body: '', title: 'Designed', type: 'feature' }, 'design')

        expect(file.content).toContain('status: design')
        expect(service.getState().snapshot?.activeCards.find((card) => card.path === file.path)?.header.status).toBe('design')
    })

    it('emits usage events after project and card operations succeed', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.projectLoading.createProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')

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
        const service = createDataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        trackEvent.mockClear()

        await expect(service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')).rejects.toThrow('commit failed')
        expect(trackEvent).not.toHaveBeenCalledWith('create_card')

        trackEvent.mockRestore()
    })

    it('leaves commits unpushed in manual mode', async () => {
        configService.init()
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', pushMode: 'manual' as const, workingFolder: 'design' }))})
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.createCard({ body: 'Body', title: 'New Card', type: 'feature' }, 'new')

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
        const service = createDataService()
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
        const service = createDataService()
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
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const updates = await service.cards.moveCard('design/B-1-b.md', 'done', 1)
        await service.cards.flushPendingCommits()

        expect(updates).toContainEqual({ after: 'p', path: 'design/B-1-b.md', status: 'done' })
        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        const committedPaths = committed.files.map((file) => file.path)
        expect(committedPaths).toEqual(['design/B-1-b.md'])
        const movedContent = committed.files[0].content
        expect(movedContent).toContain('status: done')
        expect(movedContent).toContain('after: p')
    })

    it('persists a same-column move to first place as one valid chain', async () => {
        configService.init()
        const moveFiles = [
            activeCardFile('a'),
            activeCardFile('b', { after: 'a' }),
            activeCardFile('c', { after: 'b' }),
            activeCardFile('d', { after: 'c' }),
        ]
        const { commit, storage } = createMovePersistenceStorage(moveFiles)
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.moveCard('design/C-1-c.md', 'todo', 0)
        await service.cards.flushPendingCommits()
        const reloadedSnapshot = await service.projectLoading.reloadCurrentProjectSnapshot()

        expect(commit).toHaveBeenCalledTimes(1)
        const request = commit.mock.calls[0][0]
        expect(request.files.map((file) => file.path)).toEqual([
            'design/C-1-c.md',
            'design/A-1-a.md',
            'design/D-1-d.md',
        ])
        expect(orderedInternalIds(reloadedSnapshot, 'todo')).toEqual(['c', 'a', 'b', 'd'])
        const todoCards = reloadedSnapshot?.activeCards.filter((card) => card.header.status === 'todo') ?? []
        expect(todoCards.filter((card) => card.header.after === null)).toHaveLength(1)
        expect(todoCards.find((card) => card.header.internalId === 'c')?.header.after).toBeNull()
        expect(todoCards.find((card) => card.header.internalId === 'a')?.header.after).toBe('c')
        expect(todoCards.find((card) => card.header.internalId === 'd')?.header.after).toBe('b')
    })

    it('persists a cross-column move to first place and repairs both chains', async () => {
        configService.init()
        const moveFiles = [
            activeCardFile('a'),
            activeCardFile('b', { after: 'a' }),
            activeCardFile('c', { after: 'b' }),
            activeCardFile('p', { status: 'done' }),
            activeCardFile('q', { after: 'p', status: 'done' }),
        ]
        const { commit, storage } = createMovePersistenceStorage(moveFiles)
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.moveCard('design/B-1-b.md', 'done', 0)
        await service.cards.flushPendingCommits()
        const reloadedSnapshot = await service.projectLoading.reloadCurrentProjectSnapshot()

        expect(commit).toHaveBeenCalledTimes(1)
        const request = commit.mock.calls[0][0]
        expect(request.files.map((file) => file.path)).toEqual([
            'design/B-1-b.md',
            'design/P-1-p.md',
            'design/C-1-c.md',
        ])
        expect(orderedInternalIds(reloadedSnapshot, 'todo')).toEqual(['a', 'c'])
        expect(orderedInternalIds(reloadedSnapshot, 'done')).toEqual(['b', 'p', 'q'])
        const cardsByInternalId = new Map(reloadedSnapshot?.activeCards.map((card) => [card.header.internalId, card]))
        expect(cardsByInternalId.get('b')?.header).toMatchObject({ after: null, status: 'done' })
        expect(cardsByInternalId.get('p')?.header.after).toBe('b')
        expect(cardsByInternalId.get('c')?.header.after).toBe('a')
        expect(cardsByInternalId.get('q')?.header.after).toBe('p')
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
        const service = createDataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await expect(service.cards.moveCard('design/B-1-b.md', 'todo', 0)).resolves.toBeDefined()
            await service.cards.flushPendingCommits()
        } finally {
            setTimeoutSpy.mockRestore()
            clearTimeoutSpy.mockRestore()
        }
    })

    it('archives a card, its asset, and ordering repair in one commit', async () => {
        configService.init()
        const activeFiles: MarkdownFile[] = [
            { content: '---\nid: A\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/active/A-1-a.md' },
            {
                content: '---\nid: B\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B\n\n![note](note.png)',
                path: 'design/active/B-1-b.md',
                sha: 'sha-b',
            },
            { content: '---\nid: C\ninternalId: c\ntitle: C\nstatus: todo\nafter: b\n---\n\n# C', path: 'design/active/C-1-c.md' },
        ]
        const refreshedFiles: MarkdownFile[] = [
            activeFiles[0],
            { ...activeFiles[2], content: activeFiles[2].content.replace('after: b', 'after: a') },
            {
                ...activeFiles[1],
                content: activeFiles[1].content.replace('status: todo', 'status: archived').replace('after: a\n', ''),
                path: 'design/vault/archived/B-1-b.md',
            },
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValueOnce([...activeFiles.map(({ path }) => path), 'design/active/note.png'])
                .mockResolvedValueOnce(refreshedFiles.map(({ path }) => path)),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: activeFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: refreshedFiles, workingFolder: 'design' }),
            loadProjectAsset: vi.fn(async () => ({
                content: 'aW1hZ2U=',
                contentType: 'image/png',
                encoding: 'base64' as const,
                path: 'design/active/note.png',
            })),
            loadProjectConfig: vi.fn(async () => ({
                archivedFolder: 'vault/archived',
                backgroundShade: 'blue' as const,
                projectFolder: 'design',
                releasesFolder: 'releases',
                workingFolder: 'active',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: activeFiles, workingFolder: 'design/active' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.moveCard('design/active/B-1-b.md', 'archived', 0)

        expect(storage.commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [expect.objectContaining({
                content: expect.stringContaining('after: a'),
                path: 'design/active/C-1-c.md',
            })],
            message: 'Archive design/active/B-1-b.md',
            moves: [
                expect.objectContaining({
                    content: expect.stringContaining('status: archived'),
                    fromPath: 'design/active/B-1-b.md',
                    toPath: 'design/vault/archived/B-1-b.md',
                }),
                {
                    content: 'aW1hZ2U=',
                    encoding: 'base64',
                    fromPath: 'design/active/note.png',
                    sha: undefined,
                    toPath: 'design/vault/archived/note.png',
                },
            ],
        })
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        expect(service.getState().snapshot?.activeCards.map(({ path }) => path)).toEqual([
            'design/active/A-1-a.md',
            'design/active/C-1-c.md',
        ])
        expect(service.getState().snapshot?.backgroundCards.map(({ path }) => path)).toContain('design/vault/archived/B-1-b.md')
    })

    it('rejects an existing archived-card target before committing', async () => {
        configService.init()
        const activeFile = activeCardFile('a')
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [activeFile.path, 'archived/A-1-a.md']),
            loadProject: vi.fn(async () => ({ files: [activeFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [activeFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.cards.moveCard(activeFile.path, 'archived', 0)).rejects.toThrow('Archive target already exists')
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('repairs ordering after deleting a middle card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
            activeCardFile('c', { after: 'b', sha: 'sha-c' }),
        ]
        const commit = vi.fn<StorageService['commit']>(async (request) => (
            request.files.map((file) => ({ ...file, sha: 'sha-c-next' }))
        ))
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => deletionFiles.map(({ path }) => path)),
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const reloadCurrentProjectSnapshot = vi.spyOn(service.projectLoading, 'reloadCurrentProjectSnapshot')
        const loadProjectCalls = vi.mocked(storage.loadProject).mock.calls.length
        const listRepositoryFilesCalls = vi.mocked(storage.listRepositoryFiles).mock.calls.length
        const snapshot = await service.cards.deleteCard('design/B-1-b.md')

        const repairCommit = commit.mock.calls[0][0]
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
        expect(snapshot?.activeCards.find((card) => card.path === 'design/C-1-c.md')).toMatchObject({
            header: expect.objectContaining({ after: 'a' }),
            sha: 'sha-c-next',
        })
        expect(snapshot?.repositoryFiles).toEqual(['design/A-1-a.md', 'design/C-1-c.md'])
        expect(reloadCurrentProjectSnapshot).not.toHaveBeenCalled()
        expect(storage.loadProject).toHaveBeenCalledTimes(loadProjectCalls)
        expect(storage.listRepositoryFiles).toHaveBeenCalledTimes(listRepositoryFilesCalls)
    })

    it('does not repair ordering after deleting a tail card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.deleteCard('design/B-1-b.md')

        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'design/B-1-b.md', sha: 'sha-b' }))
    })

    it('deletes an action file that is indexed in the repository but not loaded as a card', async () => {
        configService.init()
        const actionPath = 'design/actions/test.json'
        const deleteFile = vi.fn()
        const storage = createStorage({
            deleteFile,
            listRepositoryFiles: vi.fn(async () => [actionPath]),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.repositoryFiles).toContain(actionPath))
        const listRepositoryFilesCalls = vi.mocked(storage.listRepositoryFiles).mock.calls.length
        await service.cards.deleteFile(actionPath)

        expect(deleteFile).toHaveBeenCalledWith({
            branch: 'main',
            message: `Delete ${actionPath}`,
            path: actionPath,
        })
        expect(service.getState().snapshot?.repositoryFiles).not.toContain(actionPath)
        expect(storage.listRepositoryFiles).toHaveBeenCalledTimes(listRepositoryFilesCalls)
    })

    it('leaves deleted files unpushed in manual mode', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', pushMode: 'manual' as const, workingFolder: 'design' })),
        })
        const service = createDataService()
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
        const service = createDataService()
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
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
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
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        const move = committed.moves?.[0]
        expect(move?.content).toContain('title: Renamed Root')
        expect(move?.content).toContain('# Renamed Root')
    })

    it('renames the card file when the title changes and follows the card afterwards', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const renamedFile = await service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')

        expect(renamedFile.path).toBe('design/F-1-renamed-root.md')
        const committed = vi.mocked(storage.commit).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.message).toBe('Rename design/F-1-root.md to design/F-1-renamed-root.md')
        expect(committed.files).toEqual([])
        expect(committed.moves).toEqual([expect.objectContaining({
            fromPath: 'design/F-1-root.md',
            toPath: 'design/F-1-renamed-root.md',
        })])
        const cards = service.getState().snapshot?.activeCards ?? []
        expect(cards.filter((card) => card.header.internalId === 'root-card').map(({ path }) => path))
            .toEqual(['design/F-1-renamed-root.md'])
        expect(service.getState().snapshot?.repositoryFiles).toContain('design/F-1-renamed-root.md')
        expect(service.getState().snapshot?.repositoryFiles).not.toContain('design/F-1-root.md')
    })

    it('does not rename the card file when the title keeps the same file name', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.cards.updateCardTitle('design/F-1-root.md', 'root!')
        await service.cards.flushPendingCommits()

        const committed = vi.mocked(storage.commit).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.moves).toBeUndefined()
        expect(committed.files[0].path).toBe('design/F-1-root.md')
        expect(committed.files[0].content).toContain('title: root!')
    })

    it('commits queued card edits before renaming so the move never shares a batch', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nEdited body')
        await service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')

        const requests = vi.mocked(storage.commit).mock.calls.map(([request]) => request)
        const bodyCommit = requests.find((request) => request.files.some((file) => file.content.includes('Edited body')))
        const renameCommit = requests.find((request) => (request.moves ?? []).length > 0)
        expect(bodyCommit?.moves ?? []).toEqual([])
        expect(renameCommit?.files).toEqual([])
        expect(renameCommit?.moves?.[0].content).toContain('Edited body')
        expect(requests.indexOf(bodyCommit as CommitRequest)).toBeLessThan(requests.indexOf(renameCommit as CommitRequest))
    })

    it('keeps the card at its current path when the rename commit fails', async () => {
        configService.init()
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                if ((request.moves ?? []).length > 0) throw new Error('Commit rejected')

                return []
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const errors = recordDialogMessages('error')

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await expect(service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')).rejects.toThrow('Commit rejected')
        errors.stop()

        const cards = service.getState().snapshot?.activeCards ?? []
        const card = cards.find((candidate) => candidate.header.internalId === 'root-card')
        expect(card?.path).toBe('design/F-1-root.md')
        expect(card?.header.title).toBe('Renamed Root')
        expect(service.getState().snapshot?.repositoryFiles).toContain('design/F-1-root.md')
        expect(errors.messages.join('\n')).toContain('Commit rejected')
    })

    it('serializes consecutive title changes onto the latest card path', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const [, second] = await Promise.all([
            service.cards.updateCardTitle('design/F-1-root.md', 'First Rename'),
            service.cards.updateCardTitle('design/F-1-root.md', 'Second Rename'),
        ])

        expect(second.path).toBe('design/F-1-second-rename.md')
        const moves = vi.mocked(storage.commit).mock.calls.flatMap(([request]) => request.moves ?? [])
        expect(moves.map(({ fromPath, toPath }) => `${fromPath}->${toPath}`)).toEqual([
            'design/F-1-root.md->design/F-1-first-rename.md',
            'design/F-1-first-rename.md->design/F-1-second-rename.md',
        ])
        const cards = service.getState().snapshot?.activeCards ?? []
        expect(cards.filter((card) => card.header.internalId === 'root-card').map(({ path }) => path))
            .toEqual(['design/F-1-second-rename.md'])
    })

    it('edits a header field while preserving unknown header fields unchanged', async () => {
        configService.init()
        const headerFiles: MarkdownFile[] = [{
            content: '---\ncustomField: keep me\nid: F-1\ninternalId: card-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardHeaderFields('design/F-1-root.md', { status: 'ready' })
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toBe('---\ncustomField: keep me\nid: F-1\ninternalId: card-1\ntitle: Root\nstatus: ready\n---\n\n# Root')
    })

    it('preserves the frontmatter header when a card body is edited', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.updateCardBody('design/F-1-root.md', '\n# Root\n\nEdited body')
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content.startsWith('---\nid: F-1')).toBe(true)
        expect(committed.files[0].content).toContain('Edited body')
    })

    it('preserves a canonical dirty body when card metadata is saved', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        openFilesService.init({ actionService, dataService: service })
        const projectCard = service.getState().snapshot?.activeCards[0]
        if (!projectCard) throw new Error('Expected loaded card')
        const document = openFilesService.openDocument(projectCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ ...projectCard, content: '# Root\n\nUnflushed body' }, 'list-card')

        await service.cards.updateCardTitle(projectCard.path, 'Renamed')

        const committed = vi.mocked(storage.commit).mock.calls.at(-1)?.[0] as CommitRequest
        const move = committed.moves?.[0]
        expect(move?.content).toContain('title: Renamed')
        expect(move?.content).toContain('Unflushed body')
        expect(document.dirty).toBe(false)
    })

    it('does not rebuild, dispatch, or commit when saved content is unchanged', async () => {
        configService.init()
        const stableFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: card-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [stableFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [stableFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.repositoryFiles).toHaveLength(3))
        const snapshot = service.getState().snapshot
        const handleChanged = vi.fn()
        service.addEventListener('changed', handleChanged)

        service.cards.saveFile(stableFile)
        await service.cards.flushPendingCommits()

        expect(service.getState().snapshot).toBe(snapshot)
        expect(handleChanged).not.toHaveBeenCalled()
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('uses the committed sha from the first body update for the next body update', async () => {
        configService.init()
        const staleShaFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ninternalId: card-1\ntitle: Root\nstatus: active\n---\n\n# Root',
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
        const service = createDataService()
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
        const service = createDataService()
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
        const service = createDataService()
        const errors = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')

            await expect(service.cards.flushPendingCommits()).rejects.toThrow('network down')

            expect(errors.messages).toContain('network down')
            expect(captureError).toHaveBeenCalledWith(error)
            expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true)

            commit.mockImplementation(async (request) => request.files)
            await service.cards.flushPendingCommits()

            expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(false)
            expect(commit).toHaveBeenCalledTimes(2)
        } finally {
            errors.stop()
        }
    })
})
