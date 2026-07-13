import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../data/data_types'
import { WorktreeService } from './worktree_service'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const record: WorktreeRecord = { branch: 'feature', error: null, path: 'C:\\feature', valid: true }

function createStorage(): StorageService {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn(),
        createProject: vi.fn(),
        createWorkingFolderFromTemplate: vi.fn(),
        deleteFile: vi.fn(),
        listBranches: vi.fn(),
        listRepositories: vi.fn(),
        listRepositoryFiles: vi.fn(),
        listTopLevelFolders: vi.fn(),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(),
        loadWorktrees: vi.fn(async () => [record]),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        saveWorktrees: vi.fn(async (_project, folders: string[]) => folders.map((path) => ({ ...record, path }))),
        selectWorktreeFolder: vi.fn(async () => record),
    }
}

describe('WorktreeService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('loads active records and isolates draft additions and removals', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        service.init({ projectProvider: () => project, storageProvider: () => storage })
        await service.load(project)

        service.loadDraft()
        await service.addDraft()
        service.removeDraft(0)

        expect(service.getRecords()).toEqual([record])
        expect(service.getDraft()).toEqual([record])
        expect(storage.selectWorktreeFolder).toHaveBeenCalledWith(['C:\\feature'])
    })

    it('saves ordered draft paths and discards draft changes', async () => {
        const storage = createStorage()
        const service = new WorktreeService()
        service.init({ projectProvider: () => project, storageProvider: () => storage })
        await service.load(project)
        service.loadDraft()
        await service.addDraft()

        await service.saveDraft()
        expect(storage.saveWorktrees).toHaveBeenCalledWith(project, ['C:\\feature', 'C:\\feature'])

        service.removeDraft(0)
        service.discardDraft()
        expect(service.getDraft()).toBeNull()
        expect(service.getRecords()).toHaveLength(2)
    })
})
