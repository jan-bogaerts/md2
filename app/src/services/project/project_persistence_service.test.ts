import { describe, expect, it, vi } from 'vitest'
import type { ActionService } from '../actions/action_service'
import type { DataPersistenceSnapshot, DataService } from '../data/data_service'
import { ProjectPersistenceService, type ProjectPersistenceSnapshot } from './project_persistence_service'

class TestActionService extends EventTarget {
    pendingDrafts = false
    readonly flushDrafts = vi.fn(async () => undefined)

    hasPendingDrafts() {
        return this.pendingDrafts
    }

    publishChange() {
        this.dispatchEvent(new Event('changed'))
    }
}

class TestDataService extends EventTarget {
    snapshot: DataPersistenceSnapshot = { hasPendingCardCommit: false, hasPendingPush: false, isSaving: false }
    readonly cards = { flushPendingCommits: vi.fn(async () => undefined) }

    getPersistenceSnapshot() {
        return this.snapshot
    }

    publishPersistenceChange() {
        this.dispatchEvent(new Event('persistenceChanged'))
    }
}

function initService(actionService: TestActionService, dataService: TestDataService) {
    const service = new ProjectPersistenceService()
    service.init({
        actionService: actionService as unknown as ActionService,
        dataService: dataService as unknown as DataService,
    })

    return service
}

describe('ProjectPersistenceService', () => {
    it('derives aggregate state for every persistence input combination', () => {
        for (const isSaving of [false, true]) {
            for (const hasPendingCardCommit of [false, true]) {
                for (const hasPendingDrafts of [false, true]) {
                    for (const hasPendingPush of [false, true]) {
                        const actionService = new TestActionService()
                        const dataService = new TestDataService()
                        actionService.pendingDrafts = hasPendingDrafts
                        dataService.snapshot = { hasPendingCardCommit, hasPendingPush, isSaving }

                        const service = initService(actionService, dataService)
                        const hasPendingSave = isSaving || hasPendingCardCommit || hasPendingDrafts

                        expect(service.getSnapshot()).toEqual({
                            hasPendingPush,
                            hasPendingSave,
                            localSaveState: isSaving ? 'saving' : hasPendingSave ? 'dirty' : 'saved',
                        })
                    }
                }
            }
        }
    })

    it('emits only when public aggregate state changes', () => {
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        const service = initService(actionService, dataService)
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        actionService.publishChange()
        dataService.publishPersistenceChange()
        dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: true }
        dataService.publishPersistenceChange()
        dataService.publishPersistenceChange()

        expect(changed).toHaveBeenCalledTimes(1)
    })

    it('publishes dirty, saving, and saved transitions', () => {
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        const service = initService(actionService, dataService)
        const localSaveStates: ProjectPersistenceSnapshot['localSaveState'][] = []
        service.addEventListener('changed', () => localSaveStates.push(service.getSnapshot().localSaveState))

        dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: true }
        dataService.publishPersistenceChange()
        dataService.snapshot = { ...dataService.snapshot, isSaving: true }
        dataService.publishPersistenceChange()
        dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: false, isSaving: false }
        dataService.publishPersistenceChange()

        expect(localSaveStates).toEqual(['dirty', 'saving', 'saved'])
    })

    it('reconciles one action change without forwarding through DataService', () => {
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        const service = initService(actionService, dataService)
        const coordinatorChanged = vi.fn()
        const dataChanged = vi.fn()
        service.addEventListener('changed', coordinatorChanged)
        dataService.addEventListener('changed', dataChanged)

        actionService.pendingDrafts = true
        actionService.publishChange()

        expect(coordinatorChanged).toHaveBeenCalledTimes(1)
        expect(dataChanged).not.toHaveBeenCalled()
    })

    it('does not register duplicate listeners during repeated initialization', () => {
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        const service = initService(actionService, dataService)
        service.init({
            actionService: actionService as unknown as ActionService,
            dataService: dataService as unknown as DataService,
        })
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        actionService.pendingDrafts = true
        actionService.publishChange()

        expect(changed).toHaveBeenCalledTimes(1)
    })

    it('moves subscriptions when initialized with different dependencies', () => {
        const firstActionService = new TestActionService()
        const firstDataService = new TestDataService()
        const secondActionService = new TestActionService()
        const secondDataService = new TestDataService()
        const service = initService(firstActionService, firstDataService)
        service.init({
            actionService: secondActionService as unknown as ActionService,
            dataService: secondDataService as unknown as DataService,
        })
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        firstActionService.pendingDrafts = true
        firstActionService.publishChange()
        secondActionService.pendingDrafts = true
        secondActionService.publishChange()

        expect(changed).toHaveBeenCalledTimes(1)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
    })

    it('publishes saved state after action and data persistence reset', () => {
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        actionService.pendingDrafts = true
        dataService.snapshot = { hasPendingCardCommit: true, hasPendingPush: true, isSaving: false }
        const service = initService(actionService, dataService)
        const snapshots: ProjectPersistenceSnapshot[] = []
        service.addEventListener('changed', () => snapshots.push(service.getSnapshot()))

        actionService.pendingDrafts = false
        actionService.publishChange()
        dataService.snapshot = { hasPendingCardCommit: false, hasPendingPush: false, isSaving: false }
        dataService.publishPersistenceChange()

        expect(service.getSnapshot()).toEqual({ hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' })
        expect(snapshots.at(-1)).toEqual({ hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' })
    })

    it('flushes action drafts before shared card commits scheduled by draft persistence', async () => {
        const calls: string[] = []
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        actionService.pendingDrafts = true
        actionService.flushDrafts.mockImplementation(async () => {
            calls.push('actions')
            actionService.pendingDrafts = false
            dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: true }
        })
        dataService.cards.flushPendingCommits.mockImplementation(async () => {
            calls.push('cards')
            dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: false }
        })
        const service = initService(actionService, dataService)

        await service.flushPendingChanges()

        expect(calls).toEqual(['actions', 'cards'])
        expect(dataService.cards.flushPendingCommits).toHaveBeenCalledTimes(1)
    })

    it('retains dirty state and propagates action flush failures unchanged', async () => {
        const failure = new Error('invalid draft')
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        actionService.pendingDrafts = true
        actionService.flushDrafts.mockRejectedValue(failure)
        const service = initService(actionService, dataService)

        await expect(service.flushPendingChanges()).rejects.toBe(failure)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
        expect(dataService.cards.flushPendingCommits).not.toHaveBeenCalled()
    })

    it('retains dirty state and propagates card flush failures unchanged', async () => {
        const failure = new Error('commit failed')
        const actionService = new TestActionService()
        const dataService = new TestDataService()
        dataService.snapshot = { ...dataService.snapshot, hasPendingCardCommit: true }
        dataService.cards.flushPendingCommits.mockRejectedValue(failure)
        const service = initService(actionService, dataService)

        await expect(service.flushPendingChanges()).rejects.toBe(failure)
        expect(service.getSnapshot().hasPendingSave).toBe(true)
    })
})
