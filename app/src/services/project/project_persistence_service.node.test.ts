import { describe, expect, it, vi } from 'vitest'
import type { CardOpenDocument, OpenDocument, OpenDocumentSaveReference, OpenFilesService } from '../open_files_service'
import type { ActionService } from '../actions/action_service'
import type { DataPersistenceSnapshot, DataService } from '../data/data_service'
import { ProjectPersistenceService } from './project_persistence_service'
import { ACTION_PERSISTENCE_CHANGED_EVENT } from '../actions/action_service_events'
import { registerMarkdownEditorStage } from './markdown_editor_staging'

class TestActionService extends EventTarget {
    pendingDrafts = false
    readonly draftStore = {
        flushDrafts: vi.fn(async () => { this.pendingDrafts = false }),
        hasPendingDrafts: () => this.pendingDrafts,
    }
    publishChange() { this.dispatchEvent(new Event(ACTION_PERSISTENCE_CHANGED_EVENT)) }
}

class TestDataService extends EventTarget {
    snapshot: DataPersistenceSnapshot = { hasPendingFileCommit: false, hasPendingPush: false, isSaving: false }
    readonly cards = {
        flushPendingCommits: vi.fn(async () => {
            this.snapshot = { ...this.snapshot, hasPendingFileCommit: false }
        }),
        updateCardBody: vi.fn((_path: string, _content: string, saveReference?: OpenDocumentSaveReference) => {
            saveReference?.acknowledge()
        }),
    }
    readonly drainPendingStorageWrites = vi.fn(async () => {
        this.snapshot = { ...this.snapshot, isSaving: false }
    })
    getPersistenceSnapshot() { return this.snapshot }
    publishPersistenceChange() { this.dispatchEvent(new Event('persistenceChanged')) }
}

class TestOpenFilesService extends EventTarget {
    documents: OpenDocument[] = []
    getRegisteredDocuments() { return this.documents }
    publishDocumentChange() { this.dispatchEvent(new Event('documentChanged')) }
}

function initService(
    actionService = new TestActionService(),
    dataService = new TestDataService(),
    openFilesService = new TestOpenFilesService(),
) {
    const service = new ProjectPersistenceService()
    service.init({
        actionService: actionService as unknown as ActionService,
        dataService: dataService as unknown as DataService,
        openFilesService: openFilesService as unknown as OpenFilesService,
    })
    return { actionService, dataService, openFilesService, service }
}

function dirtyCardDocument(): CardOpenDocument {
    const card = { content: 'Draft' }
    let dirty = true
    const document = Object.assign(new EventTarget(), {
        createSaveReference: vi.fn(() => ({ document, acknowledge: () => { dirty = false } })),
        getDraft: () => card, getObject: () => card, kind: 'card' as const,
        path: 'design/card.md', replaceDraft: vi.fn(), updateDraft: vi.fn(),
    }) as unknown as CardOpenDocument
    Object.defineProperty(document, 'dirty', { get: () => dirty })

    return document
}

describe('ProjectPersistenceService', () => {
    it('aggregates dirty documents, batches, action drafts, storage operations, and push state', () => {
        const { actionService, dataService, openFilesService, service } = initService()
        openFilesService.documents = [dirtyCardDocument()]
        dataService.snapshot = { hasPendingFileCommit: true, hasPendingPush: true, isSaving: false }
        actionService.pendingDrafts = true
        openFilesService.publishDocumentChange()

        expect(service.getSnapshot()).toEqual({ hasPendingPush: true, hasPendingSave: true, localSaveState: 'dirty' })

        dataService.snapshot = { ...dataService.snapshot, isSaving: true }
        dataService.publishPersistenceChange()
        expect(service.getSnapshot().localSaveState).toBe('saving')
    })

    it('emits only when public aggregate state changes', () => {
        const { actionService, service } = initService()
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        actionService.publishChange()
        actionService.pendingDrafts = true
        actionService.publishChange()
        actionService.publishChange()

        expect(changed).toHaveBeenCalledOnce()
    })

    it('flushes action drafts, card drafts, then physical batches', async () => {
        const { actionService, dataService, openFilesService, service } = initService()
        const calls: string[] = []
        actionService.pendingDrafts = true
        openFilesService.documents = [dirtyCardDocument()]
        dataService.snapshot = { ...dataService.snapshot, hasPendingFileCommit: true }
        actionService.draftStore.flushDrafts.mockImplementation(async () => {
            calls.push('actions')
            actionService.pendingDrafts = false
        })
        dataService.cards.updateCardBody.mockImplementation((_path, _content, saveReference) => {
            calls.push('card-draft')
            saveReference?.acknowledge()
        })
        dataService.cards.flushPendingCommits.mockImplementation(async () => {
            calls.push('batch')
            dataService.snapshot = { ...dataService.snapshot, hasPendingFileCommit: false }
        })

        await service.flushPendingChanges()

        expect(calls).toEqual(['actions', 'card-draft', 'batch'])
    })

    it('reconciles live dependencies after a flush without relying on dependency events', async () => {
        const { actionService, dataService, openFilesService, service } = initService()
        actionService.pendingDrafts = true
        openFilesService.documents = [dirtyCardDocument()]
        dataService.snapshot = { ...dataService.snapshot, hasPendingFileCommit: true }
        actionService.publishChange()

        expect(service.getSnapshot().localSaveState).toBe('dirty')

        await service.flushPendingChanges()

        expect(service.getSnapshot()).toEqual({ hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' })
    })

    it('rejects once with the unresolved blockers when a flush cannot become clean', async () => {
        const { openFilesService, service } = initService()
        const document = dirtyCardDocument()
        document.createSaveReference = vi.fn(() => ({ document, acknowledge: vi.fn() }))
        openFilesService.documents = [document]
        openFilesService.publishDocumentChange()

        await expect(service.flushPendingChanges()).rejects.toThrow(
            'Pending changes remain after flush: card document design/card.md',
        )
    })

    it('drains storage writes before reporting success', async () => {
        const { dataService, service } = initService()
        dataService.snapshot = { ...dataService.snapshot, isSaving: true }

        await service.flushPendingChanges()

        expect(dataService.drainPendingStorageWrites).toHaveBeenCalledOnce()
        expect(service.getSnapshot().hasPendingSave).toBe(false)
    })

    it('keeps dirty state when action validation blocks flush', async () => {
        const failure = new Error('invalid draft')
        const { actionService, dataService, service } = initService()
        actionService.pendingDrafts = true
        actionService.draftStore.flushDrafts.mockRejectedValue(failure)
        actionService.publishChange()

        await expect(service.flushPendingChanges()).rejects.toBe(failure)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
        expect(dataService.cards.flushPendingCommits).not.toHaveBeenCalled()
    })

    it('aborts before drafts when a mounted editor cannot stage its buffer', async () => {
        const { actionService, service } = initService()
        actionService.pendingDrafts = true
        const unregister = registerMarkdownEditorStage(() => false)

        await expect(service.flushPendingChanges()).rejects.toThrow('could not stage')
        expect(actionService.draftStore.flushDrafts).not.toHaveBeenCalled()
        unregister()
    })

    it('keeps pending state when physical persistence fails', async () => {
        const failure = new Error('commit failed')
        const { dataService, service } = initService()
        dataService.snapshot = { ...dataService.snapshot, hasPendingFileCommit: true }
        dataService.cards.flushPendingCommits.mockRejectedValue(failure)
        dataService.publishPersistenceChange()

        await expect(service.flushPendingChanges()).rejects.toBe(failure)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
    })
})
