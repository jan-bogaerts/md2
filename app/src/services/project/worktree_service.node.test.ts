import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card, ProjectReference, ProjectSnapshot, StorageService, WorktreeRecord, WorktreeState } from '../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { createDeferred } from '../test_support/data_service_test_support'
import { PrimaryWorktreeSelectionError } from './worktree_errors'
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

function card(path: string, title: string, worktree: number | null): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, references: [], status: 'ready', title, worktree, worktreeError: null, worktreeValue: worktree ? String(worktree) : null,
        }, hasFrontmatter: true, isActive: true, path,
    }
}

function snapshot(activeCards: Card[] = [], backgroundCards: Card[] = []): ProjectSnapshot {
    return { activeCards, backgroundCards, repositoryFiles: [], workingFolder: 'design' }
}

function createStorage() {
    let listener: ((state: WorktreeState) => void) | null = null
    const cleanup = vi.fn()
    const storage = {
        addWorktree: vi.fn(async () => undefined),
        commitWorktree: vi.fn(async () => undefined),
        deleteLocalBranch: vi.fn(async () => undefined),
        discardWorktreeChanges: vi.fn(async () => undefined),
        integrateWorktree: vi.fn(async () => ({ status: 'completed' as const })),
        onWorktreesChanged: vi.fn((callback: (state: WorktreeState) => void) => {
            listener = callback
            return cleanup
        }),
        parkWorktree: vi.fn(async () => undefined),
        prepareWorktree: vi.fn(async () => undefined),
        pullWorktree: vi.fn(async () => undefined),
        pushWorktree: vi.fn(async () => undefined),
        rebaseWorktree: vi.fn(async () => ({ status: 'completed' as const })),
        refreshWorktrees: vi.fn(async () => undefined),
        removeWorktree: vi.fn(async () => undefined),
        selectWorktreeFolder: vi.fn(async () => 'C:\\new'),
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
    const clearCardBranch = vi.fn()
    const unassignCardWorktree = vi.fn()
    service.init({
        assignCardWorktree,
        cardSeparatorProvider: () => '-',
        clearCardBranch,
        flushPendingChanges,
        projectFolderProvider: () => projectFolder,
        projectProvider: () => project,
        snapshotProvider: () => projectSnapshot,
        storageProvider: () => storage,
        unassignCardWorktree,
    })

    return { assignCardWorktree, clearCardBranch, unassignCardWorktree }
}

describe('WorktreeService', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

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

    it('stages additions and removals without changing live records or Git', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.startDraft()

        await service.selectDraftAddition()
        service.stageDraftRemoval(first.path, 'unregister')
        service.stageDraftRemoval(first.path, 'files')

        expect(service.getDraft()).toMatchObject({
            additions: ['C:\\new'],
            removals: [{ mode: 'unregister', path: first.path }],
        })
        expect(service.getRecords()).toEqual([first])
        expect(storage.addWorktree).not.toHaveBeenCalled()
        expect(storage.removeWorktree).not.toHaveBeenCalled()

        service.discardDraft()
        expect(service.getDraft()).toBeNull()
    })

    it('leaves draft unchanged when folder selection is cancelled', async () => {
        const { emit, storage } = createStorage()
        storage.selectWorktreeFolder = vi.fn(async () => null)
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.startDraft()

        await expect(service.selectDraftAddition()).resolves.toBeNull()

        expect(service.getDraft()).toMatchObject({ additions: [], records: [first], removals: [] })
    })

    it('rejects primary project folder as expected user input without changing draft', async () => {
        const { emit, storage } = createStorage()
        storage.selectWorktreeFolder = vi.fn(async () => 'c:/PROJECT/')
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.startDraft()

        await expect(service.selectDraftAddition()).rejects.toBeInstanceOf(PrimaryWorktreeSelectionError)

        expect(service.getDraft()).toMatchObject({ additions: [], selecting: false })
    })

    it('rejects existing and pending worktree paths', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.startDraft()

        storage.selectWorktreeFolder = vi.fn(async () => 'c:/FEATURE')
        await expect(service.selectDraftAddition()).rejects.toThrow('Folder is already a linked worktree')
        storage.selectWorktreeFolder = vi.fn(async () => 'C:\\new')
        await service.selectDraftAddition()
        storage.selectWorktreeFolder = vi.fn(async () => 'c:/NEW/')
        await expect(service.selectDraftAddition()).rejects.toThrow('Folder is already pending addition')
    })

    it('applies removals before additions and clears completed draft items', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first])
        service.startDraft()
        service.stageDraftRemoval(first.path, 'files')
        await service.selectDraftAddition()

        await service.applyDraft()

        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path, 'files')
        expect(storage.addWorktree).toHaveBeenCalledWith(project, 'C:\\new')
        expect(vi.mocked(storage.removeWorktree!).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(storage.addWorktree!).mock.invocationCallOrder[0])
        expect(service.getDraft()).toMatchObject({ additions: [], applying: false, removals: [] })
    })

    it('refreshes live records and retains unapplied items after partial failure', async () => {
        const { emit, storage } = createStorage()
        const failure = new Error('second removal failed')
        storage.removeWorktree = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(failure)
        const service = new WorktreeService()
        initService(service, storage)
        emit(project, [first, second])
        service.startDraft()
        service.stageDraftRemoval(first.path)
        service.stageDraftRemoval(second.path, 'unregister')

        await expect(service.applyDraft()).rejects.toBe(failure)

        expect(storage.refreshWorktrees).toHaveBeenCalledWith(project)
        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path, 'folder')
        expect(service.getDraft()).toMatchObject({
            applying: false,
            removals: [{ mode: 'unregister', path: second.path }],
        })
    })

    it('prepares an available worktree before assigning it', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const activeCard = card('design/F-1.md', 'Prepare This Card!', null)
        const { assignCardWorktree } = initService(service, storage, snapshot([activeCard]))
        emit(project, [first])

        await service.setCardWorktree(activeCard.path, 1)

        expect(storage.prepareWorktree).toHaveBeenCalledWith({ branchName: 'design-f-1-md-prepare-this-card', project, worktree: 1 })
        expect(assignCardWorktree).toHaveBeenCalledWith(activeCard.path, 1, 'design-f-1-md-prepare-this-card')
    })

    it('reserves a worktree while preparation is pending', async () => {
        const pendingPreparation = createDeferred<void>()
        const { emit, storage } = createStorage()
        storage.prepareWorktree = vi.fn(() => pendingPreparation.promise)
        const service = new WorktreeService()
        const firstCard = card('design/F-1.md', 'First', null)
        const secondCard = card('design/F-2.md', 'Second', null)
        const { assignCardWorktree } = initService(service, storage, snapshot([firstCard, secondCard]))
        emit(project, [first])

        const firstAssignment = service.setCardWorktree(firstCard.path, 1)
        expect(service.isWorktreeAvailableForCard(1, secondCard.path)).toBe(false)
        pendingPreparation.resolve()
        await firstAssignment

        expect(assignCardWorktree).toHaveBeenCalledWith(firstCard.path, 1, 'design-f-1-md-first')
    })

    it('keeps the card assigned when backend parking rejects newly dirty state', async () => {
        const { emit, storage } = createStorage()
        storage.parkWorktree = vi.fn(async () => {
            emit(project, [{ ...first, status: { ...first.status, dirty: true } }])
            throw new Error('Linked worktree has uncommitted changes')
        })
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        const { assignCardWorktree } = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await expect(service.setCardWorktree(assignedCard.path, null)).rejects.toThrow('uncommitted changes')

        expect(assignCardWorktree).not.toHaveBeenCalled()
        expect(service.getRecords()[0].status.dirty).toBe(true)
    })

    it('commits worktree changes without combining later lifecycle operations', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        const { assignCardWorktree } = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await service.commitCardWorktree(assignedCard.path, 'F-1: Assigned')

        expect(storage.commitWorktree).toHaveBeenCalledWith({ message: 'F-1: Assigned', project, worktree: 1 })
        expect(storage.pushWorktree).not.toHaveBeenCalled()
        expect(storage.parkWorktree).not.toHaveBeenCalled()
        expect(assignCardWorktree).not.toHaveBeenCalled()
    })

    it('uses one outgoing-status rule for integration availability and worktree diff loading', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        initService(service, storage, snapshot([assignedCard]))
        const generateWorktreeDiff = vi.fn(async () => ({ files: [], repositoryRoot: first.path }))
        setActionBridgeOverride({ generateWorktreeDiff } as unknown as ElectronActionBridge)

        emit(project, [first])
        expect(service.canIntegrateCardWorktree(assignedCard.path)).toBe(false)
        await expect(service.generateCardWorktreeDiff(assignedCard.path)).rejects.toThrow('no changes to integrate')

        emit(project, [{ ...first, status: { ...first.status, dirty: true } }])
        expect(service.canIntegrateCardWorktree(assignedCard.path)).toBe(true)
        await expect(service.generateCardWorktreeDiff(assignedCard.path)).resolves.toEqual({ files: [], repositoryRoot: first.path })
        expect(generateWorktreeDiff).toHaveBeenCalledWith({ worktree: 1 })

        emit(project, [{ ...first, status: { ...first.status, baseAhead: 1, dirty: false } }])
        expect(service.canIntegrateCardWorktree(assignedCard.path)).toBe(true)
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

        await service.integrateCardWorktree(assignedCard.path, false)

        expect(flushPendingChanges.mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.integrateWorktree!).mock.invocationCallOrder[0],
        )
        expect(storage.integrateWorktree).toHaveBeenCalledWith({
            cardInternalId: assignedCard.header.internalId,
            deleteBranch: false,
            project,
            projectFolder: 'design',
            worktree: 1,
        })
    })

    it('asks desktop to clean branch, then clears renderer assignment after successful integration', async () => {
        const { emit, storage } = createStorage()
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        assignedCard.header.branch = 'f-1-assigned'
        const { clearCardBranch, unassignCardWorktree } = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await service.integrateCardWorktree(assignedCard.path, true)

        expect(storage.integrateWorktree).toHaveBeenCalledWith({
            branchName: 'f-1-assigned',
            cardInternalId: assignedCard.header.internalId,
            deleteBranch: true,
            project,
            projectFolder: 'design',
            worktree: 1,
        })
        expect(storage.parkWorktree).not.toHaveBeenCalled()
        expect(storage.deleteLocalBranch).not.toHaveBeenCalled()
        expect(unassignCardWorktree).toHaveBeenCalledWith(assignedCard.path)
        expect(clearCardBranch).toHaveBeenCalledWith(assignedCard.path)
    })

    it('retains branch identity while desktop integration is paused for conflicts', async () => {
        const { emit, storage } = createStorage()
        storage.integrateWorktree = vi.fn(async () => ({
            session: {
                conflictedPaths: ['src/file.ts'], externalResolverConfigured: false, id: 'session-1',
                operation: 'integrate' as const, phase: 'rebase' as const, repositoryRoot: 'C:/feature', worktree: 1,
            },
            status: 'conflict' as const,
        }))
        const service = new WorktreeService()
        const assignedCard = card('design/F-1.md', 'Assigned', 1)
        assignedCard.header.branch = 'f-1-assigned'
        const { clearCardBranch, unassignCardWorktree } = initService(service, storage, snapshot([assignedCard]))
        emit(project, [first])

        await expect(service.integrateCardWorktree(assignedCard.path, true)).resolves.toMatchObject({ status: 'conflict' })

        expect(unassignCardWorktree).not.toHaveBeenCalled()
        expect(clearCardBranch).not.toHaveBeenCalled()
        expect(assignedCard.header.branch).toBe('f-1-assigned')
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
