import { describe, expect, it, vi } from 'vitest'
import type { CardOpenDocument, OpenDocument, OpenFilesService } from '../open_files_service'
import type { ActionService } from '../actions/action_service'
import type { DataPersistenceSnapshot, DataService } from '../data/data_service'
import { ProjectPersistenceService } from './project_persistence_service'

class TestActionService extends EventTarget {
    pendingDrafts = false
    readonly flushDrafts = vi.fn(async () => undefined)
    hasPendingDrafts() { return this.pendingDrafts }
    publishChange() { this.dispatchEvent(new Event('changed')) }
}

class TestDataService extends EventTarget {
    snapshot: DataPersistenceSnapshot = { hasPendingFileCommit: false, hasPendingPush: false, isSaving: false }
    readonly cards = {
        flushPendingCommits: vi.fn(async () => undefined),
        updateCardBody: vi.fn(),
    }
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
    return Object.assign(new EventTarget(), {
        createSaveReference: vi.fn(() => ({ acknowledge: vi.fn() })), dirty: true,
        getDraft: () => card, getObject: () => card, kind: 'card' as const,
        path: 'design/card.md', replaceDraft: vi.fn(), updateDraft: vi.fn(),
    }) as unknown as CardOpenDocument
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

    it('flushes action drafts, canonical card drafts, then physical batches', async () => {
        const { actionService, dataService, openFilesService, service } = initService()
        const calls: string[] = []
        actionService.pendingDrafts = true
        openFilesService.documents = [dirtyCardDocument()]
        dataService.snapshot = { ...dataService.snapshot, hasPendingFileCommit: true }
        actionService.flushDrafts.mockImplementation(async () => { calls.push('actions') })
        dataService.cards.updateCardBody.mockImplementation(() => { calls.push('card-draft') })
        dataService.cards.flushPendingCommits.mockImplementation(async () => { calls.push('batch') })

        await service.flushPendingChanges()

        expect(calls).toEqual(['actions', 'card-draft', 'batch'])
    })

    it('keeps dirty state when action validation blocks flush', async () => {
        const failure = new Error('invalid draft')
        const { actionService, dataService, service } = initService()
        actionService.pendingDrafts = true
        actionService.flushDrafts.mockRejectedValue(failure)
        actionService.publishChange()

        await expect(service.flushPendingChanges()).rejects.toBe(failure)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
        expect(dataService.cards.flushPendingCommits).not.toHaveBeenCalled()
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
