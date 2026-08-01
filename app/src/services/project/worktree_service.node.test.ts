import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard, ProjectReference, ProjectSnapshot, StorageService, WorktreeRecord, WorktreeState } from '../../data/data_types'
import { createDeferred } from '../test_support/data_service_test_support'
import { WorktreeService } from './worktree_service'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const first: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}
const second: WorktreeRecord = {
    branch: 'second', error: null, parkingBranch: 'md2/parking/second', path: 'C:\\second',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function card(path: string, title: string, worktree: number | null): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status: 'ready', title, worktree, worktreeError: null, worktreeValue: worktree ? String(worktree) : null,
        }, headerFields: {}, isActive: true, path,
    }
}

function snapshot(activeCards: ProjectCard[] = [], backgroundCards: ProjectCard[] = []): ProjectSnapshot {
    return { activeCards, backgroundCards, repositoryFiles: [], workingFolder: 'design' }
}

function createStorage() {
    let listener: ((state: WorktreeState) => void) | null = null
    const cleanup = vi.fn()
    const storage = {
        addWorktree: vi.fn(async () => true),
        commitWorktree: vi.fn(async () => undefined),
        discardWorktreeChanges: vi.fn(async () => undefined),
        integrateWorktree: vi.fn(async () => undefined),
        onWorktreesChanged: vi.fn((callback: (state: WorktreeState) => void) => {
            listener = callback
            return cleanup
        }),
        parkWorktree: vi.fn(async () => undefined),
        prepareWorktree: vi.fn(async () => undefined),
        pullWorktree: vi.fn(async () => undefined),
        pushWorktree: vi.fn(async () => undefined),
        rebaseWorktree: vi.fn(async () => undefined),
        refreshWorktrees: vi.fn(async () => undefined),
        removeWorktree: vi.fn(async () => undefined),
    } as unknown as StorageService
    const emit = (stateProject: ProjectReference | null, records: WorktreeRecord[], error: string | null = null) => {
        if (!listener) throw new Error('Missing worktree subscription')
        listener({ error, primaryStatus: null, project: stateProject, records })
    }

    return { cleanup, emit, storage }
}

function initService(
    service: WorktreeService,
    storage: StorageService,
    projectSnapshot = snapshot(),
    flushPendingChanges = vi.fn(async () => undefined),
    projectFolder = 'design',
) {
    const assignCardWorktree = vi.fn()
    service.init({
        assignCardWorktree,
        cardSeparatorProvider: () => '-',
        flushPendingChanges,
        projectFolderProvider: () => projectFolder,
        projectProvider: () => project,
        snapshotProvider: () => projectSnapshot,
        storageProvider: () => storage,
    })

    return assignCardWorktree
}

describe('WorktreeService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('replaces records from pushed state and preserves identity for equal records', () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        const records = service.getRecords()

        emit(project, [{ ...first, status: { ...first.status } }])

        expect(service.getRecords()).toBe(records)
    })

    it('replaces the old subscription when initialized again', () => {
        const firstStorage = createStorage()
        const secondStorage = createStorage()
        const service = new WorktreeService()
        initService(service, firstStorage.storage)

        initService(service, secondStorage.storage)

        expect(firstStorage.cleanup).toHaveBeenCalledOnce()
    })

    it('ignores state for a foreign project', () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)

        emit({ ...project, id: 'other' }, [first])

        expect(service.getRecords()).toEqual([])
    })

    it('reports creation progress and relies on the pushed result', async () => {
        const pendingAddition = createDeferred<boolean>()
        const { emit, storage } = createStorage()
        storage.addWorktree = vi.fn(() => pendingAddition.promise)
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])

        const addition = service.add()
        expect(service.isAdding()).toBe(true)
        emit(project, [first, second])
        pendingAddition.resolve(true)
        await addition

        expect(service.isAdding()).toBe(false)
        expect(service.getRecords()).toEqual([first, second])
    })

    it('removes the selected worktree without consuming a command result', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])

        await service.remove(0)

        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path)
    })

    it('prepares an available worktree before assigning it', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const activeCard = card('design/F-1.md', 'Prepare This Card!', null)
        const assignCardWorktree = initService(service, storage, snapshot([activeCard]))
        emit(project, [first])

        await service.setCardWorktree(activeCard.path, 1)

        expect(storage.prepareWorktree).toHaveBeenCalledWith({ branchName: 'design-f-1-md-prepare-this-card', project, worktree: 1 })
        expect(assignCardWorktree).toHaveBeenCalledWith(activeCard.path, 1)
    })

    it('reserves a worktree while preparation is pending', async () => {
        const pendingPreparation = createDeferred<void>()
        const { emit, storage } = createStorage()
        storage.prepareWorktree = vi.fn(() => pendingPreparation.promise)
        const service = new WorktreeService()
        const firstCard = card('design/F-1.md', 'First', null)
        const secondCard = card('design/F-2.md', 'Second', null)
        const assignCardWorktree = initService(service, storage, snapshot([firstCard, secondCard]))
        emit(project, [first])

        const firstAssignment = service.setCardWorktree(firstCard.path, 1)
        expect(service.isWorktreeAvailableForCard(1, secondCard.path)).toBe(false)
        pendingPreparation.resolve()
        await firstAssignment

        expect(assignCardWorktree).toHaveBeenCalledWith(firstCard.path, 1)
    })

    it('keeps the card assigned when backend parking rejects newly dirty state', async () => {
        const { emit, storage } = createStorage()
        storage.parkWorktree = vi.fn(async () => {
            emit(project, [{ ...first, status: { ...first.status, dirty: true } }])
            throw new Error('Linked worktree has uncommitted changes')
        })
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        const assignCardWorktree = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await expect(service.setCardWorktree(assignedCard.path, null)).rejects.toThrow('uncommitted changes')

        expect(assignCardWorktree).not.toHaveBeenCalled()
        expect(service.getRecords()[0].status.dirty).toBe(true)
    })

    it('commits worktree changes without combining later lifecycle operations', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        const assignCardWorktree = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await service.commitCardWorktree(assignedCard.path, 'F-1: Assigned')

        expect(storage.commitWorktree).toHaveBeenCalledWith({ message: 'F-1: Assigned', project, worktree: 1 })
        expect(storage.pushWorktree).not.toHaveBeenCalled()
        expect(storage.parkWorktree).not.toHaveBeenCalled()
        expect(assignCardWorktree).not.toHaveBeenCalled()
    })

    it('flushes project changes before updating a card worktree', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        const flushPendingChanges = vi.fn(async () => undefined)
        initService(service, storage, snapshot([assignedCard]), flushPendingChanges)
        emit(project, [first])

        await service.updateCardWorktree(assignedCard.path)

        expect(flushPendingChanges.mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.rebaseWorktree!).mock.invocationCallOrder[0],
        )
    })

    it('flushes project changes before integrating a card worktree', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/feature_descriptions/F-1.md', 'Assigned', 1)
        const flushPendingChanges = vi.fn(async () => undefined)
        const projectSnapshot = { ...snapshot([assignedCard]), workingFolder: 'design/feature_descriptions' }
        initService(service, storage, projectSnapshot, flushPendingChanges)
        emit(project, [first])

        await service.integrateCardWorktree(assignedCard.path)

        expect(flushPendingChanges.mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.integrateWorktree!).mock.invocationCallOrder[0],
        )
        expect(storage.integrateWorktree).toHaveBeenCalledWith({
            cardInternalId: assignedCard.header.internalId,
            project,
            projectFolder: 'design',
            worktree: 1,
        })
    })

    it('integrates a project worktree without card tracking fields', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.setProjectActionWorktree(1)

        await service.integrateProjectWorktree()

        expect(storage.integrateWorktree).toHaveBeenCalledWith({ project, worktree: 1 })
    })
})
