import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { createDeferred } from '../test_support/data_service_test_support'
import { WorktreeService } from './worktree_service'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const first: WorktreeRecord = { branch: 'feature', error: null, path: 'C:\\feature', valid: true }
const second: WorktreeRecord = { branch: 'second', error: null, path: 'C:\\second', valid: true }

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
        push: vi.fn(),
        removeWorktree: vi.fn(async () => []),
        saveProjectConfig: vi.fn(),
    }
}

describe('WorktreeService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('loads Git worktrees and replaces records after adding one', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        service.init({ projectProvider: () => project, storageProvider: () => storage })
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
        service.init({ projectProvider: () => project, storageProvider: () => storage })
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
        service.init({ projectProvider: () => project, storageProvider: () => storage })
        await service.load(project)

        await service.remove(0)

        expect(service.getRecords()).toEqual([])
        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path)
    })

    it('keeps a valid project action assignment only for the loaded-project session', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        service.init({ projectProvider: () => project, storageProvider: () => storage })
        await service.load(project)

        service.setProjectActionWorktree(1)
        expect(service.getProjectActionWorktree()).toBe(1)

        await service.load({ ...project, id: 'next-project' })
        expect(service.getProjectActionWorktree()).toBeNull()
    })

    it('rejects unavailable project action assignments', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        service.init({ projectProvider: () => project, storageProvider: () => storage })
        await service.load(project)

        expect(() => service.setProjectActionWorktree(2)).toThrow('Configured worktree 2 does not exist')
        expect(service.getProjectActionWorktree()).toBeNull()
    })
})
