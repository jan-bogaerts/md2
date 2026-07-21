import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard, ProjectReference, ProjectSnapshot, StorageService, WorktreeRecord } from '../../data/data_types'
import { createDeferred } from '../test_support/data_service_test_support'
import { WorktreeService } from './worktree_service'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const first: WorktreeRecord = { branch: 'feature', error: null, path: 'C:\\feature', valid: true }
const second: WorktreeRecord = { branch: 'second', error: null, path: 'C:\\second', valid: true }

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

function createStorage(): StorageService {
    return {
        addWorktree: vi.fn(async () => [first, second]),
        checkoutBranch: vi.fn(),
        commit: vi.fn(),
        createProject: vi.fn(),
        createWorkingFolderFromTemplate: vi.fn(),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        listBranches: vi.fn(),
        listRepositories: vi.fn(),
        listRepositoryFiles: vi.fn(),
        listTopLevelFolders: vi.fn(),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(),
        loadWorktrees: vi.fn(async () => [first]),
        moveFiles: vi.fn(),
        prepareWorktree: vi.fn(async () => [first, second]),
        push: vi.fn(),
        removeWorktree: vi.fn(async () => []),
        saveProjectConfig: vi.fn(),
    }
}

function initService(service: WorktreeService, storage: StorageService, projectSnapshot = snapshot()) {
    const assignCardWorktree = vi.fn()
    service.init({
        assignCardWorktree,
        cardSeparatorProvider: () => '-',
        projectProvider: () => project,
        snapshotProvider: () => projectSnapshot,
        storageProvider: () => storage,
    })

    return assignCardWorktree
}

describe('WorktreeService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('loads Git worktrees and replaces records after adding one', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        await service.load(project)

        await service.add()

        expect(service.getRecords()).toEqual([first, second])
        expect(storage.addWorktree).toHaveBeenCalledWith(project)
    })

    it('reports creation progress until adding finishes', async () => {
        const pendingAddition = createDeferred<WorktreeRecord[]>()
        const storage = createStorage()
        storage.addWorktree = vi.fn(() => pendingAddition.promise)
        const service = new WorktreeService()
        initService(service, storage)
        await service.load(project)

        const addition = service.add()
        expect(service.isAdding()).toBe(true)

        pendingAddition.resolve([first, second])
        await addition
        expect(service.isAdding()).toBe(false)
    })

    it('removes the selected Git worktree and replaces records', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        await service.load(project)

        await service.remove(0)

        expect(service.getRecords()).toEqual([])
        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path)
    })

    it('keeps a valid project action assignment only for the loaded-project session', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        await service.load(project)

        service.setProjectActionWorktree(1)
        expect(service.getProjectActionWorktree()).toBe(1)

        await service.load({ ...project, id: 'next-project' })
        expect(service.getProjectActionWorktree()).toBeNull()
    })

    it('rejects unavailable project action assignments', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        initService(service, storage)
        await service.load(project)

        expect(() => service.setProjectActionWorktree(2)).toThrow('Configured worktree 2 does not exist')
        expect(service.getProjectActionWorktree()).toBeNull()
    })

    it('prepares an available worktree with the card title slug before assigning it', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        const activeCard = card('design/F-1.md', 'Prepare This Card!', null)
        const assignCardWorktree = initService(service, storage, snapshot([activeCard]))
        await service.load(project)

        await service.setCardWorktree(activeCard.path, 1)

        expect(storage.prepareWorktree).toHaveBeenCalledWith({ branchName: 'prepare-this-card', project, worktree: 1 })
        expect(assignCardWorktree).toHaveBeenCalledWith(activeCard.path, 1)
    })

    it('reserves worktrees assigned to other active cards but not background cards', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        const target = card('design/F-1.md', 'Target', null)
        const owner = card('design/F-2.md', 'Owner', 1)
        const background = card('design/history/F-3.md', 'Done', 2)
        initService(service, storage, snapshot([target, owner], [background]))
        await service.load(project)

        expect(service.isWorktreeAvailableForCard(1, target.path)).toBe(false)
        expect(service.isWorktreeAvailableForCard(1, owner.path)).toBe(true)
        expect(service.isWorktreeAvailableForCard(2, target.path)).toBe(true)
        await expect(service.setCardWorktree(target.path, 1)).rejects.toThrow('already assigned to another active card')
    })

    it('does not persist assignment when Electron preparation fails', async () => {
        const storage = createStorage()
        storage.prepareWorktree = vi.fn(async () => { throw new Error('dirty worktree') })
        const service = new WorktreeService()
        const activeCard = card('design/F-1.md', 'Target', null)
        const assignCardWorktree = initService(service, storage, snapshot([activeCard]))
        await service.load(project)

        await expect(service.setCardWorktree(activeCard.path, 1)).rejects.toThrow('dirty worktree')
        expect(assignCardWorktree).not.toHaveBeenCalled()
        expect(service.isPreparingCard(activeCard.path)).toBe(false)
    })

    it('reserves a worktree while preparation is pending', async () => {
        const pendingPreparation = createDeferred<WorktreeRecord[]>()
        const storage = createStorage()
        storage.prepareWorktree = vi.fn(() => pendingPreparation.promise)
        const service = new WorktreeService()
        const firstCard = card('design/F-1.md', 'First', null)
        const secondCard = card('design/F-2.md', 'Second', null)
        const assignCardWorktree = initService(service, storage, snapshot([firstCard, secondCard]))
        await service.load(project)

        const firstAssignment = service.setCardWorktree(firstCard.path, 1)
        expect(service.isWorktreeAvailableForCard(1, secondCard.path)).toBe(false)
        await expect(service.setCardWorktree(secondCard.path, 1)).rejects.toThrow('already assigned to another active card')

        pendingPreparation.resolve([first, second])
        await firstAssignment
        expect(assignCardWorktree).toHaveBeenCalledWith(firstCard.path, 1)
    })

    it('allows project-agent assignment to a card-reserved worktree without preparation', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        initService(service, storage, snapshot([card('design/F-1.md', 'Owner', 1)]))
        await service.load(project)

        service.setProjectActionWorktree(1)

        expect(service.getProjectActionWorktree()).toBe(1)
        expect(storage.prepareWorktree).not.toHaveBeenCalled()
    })
})
