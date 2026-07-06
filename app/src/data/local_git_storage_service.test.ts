import { describe, expect, it, vi } from 'vitest'
import { LocalGitStorageService } from './local_git_storage_service'
import type { ActionSchedule } from './action_schedule_types'
import type { ElectronDataBridge } from './electron_data_bridge'

function createBridge(): ElectronDataBridge {
    return {
        cancelActionSchedule: vi.fn(async () => []),
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadActionSchedules: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        saveActionSchedules: vi.fn(async (_project, _actionsFolder, schedules) => schedules),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('LocalGitStorageService', () => {
    it('delegates project operations to the Electron bridge', async () => {
        const bridge = createBridge()
        const service = new LocalGitStorageService()
        service.init({ bridge })

        const project = await service.openProjectFolder()
        await service.loadProject(project!, 'design')
        await service.loadProjectRoot(project!, 'design')
        await service.loadProjectConfig(project!)
        await service.loadActionSchedules(project!, 'actions')
        await service.saveActionSchedules(project!, 'actions', [])
        await service.cancelActionSchedule(project!, 'actions', 'schedule-1')
        await service.listRepositoryFiles(project!)
        await service.listTopLevelFolders(project!)
        await service.createWorkingFolderFromTemplate(project!, 'design')
        await service.checkoutBranch(project!, 'feature')
        const commitResult = await service.commit({
            branch: 'feature',
            files: [{ content: '# Test', path: 'design/F-1-test.md' }],
            message: 'Update test',
        })
        await service.deleteFile({ branch: 'feature', message: 'Delete test', path: 'design/F-1-test.md', sha: 'sha-1' })
        await service.moveFiles({
            branch: 'feature',
            message: 'Complete release v1',
            moves: [{ content: '# Test', fromPath: 'design/F-1-test.md', toPath: 'design/history/v1/F-1-test.md' }],
        })
        await service.saveProjectConfig(project!, {
            actionsFolder: 'actions',
            cardBodyTemplate: '# Template',
            cardTypes: [],
            diffCommand: 'git show {{commit}}',
            pushMode: 'auto',
            workingFolder: 'design',
        })
        await service.push(project!)

        expect(bridge.openProjectFolder).toHaveBeenCalled()
        expect(bridge.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(bridge.loadProjectRoot).toHaveBeenCalledWith(project, 'design')
        expect(bridge.loadProjectConfig).toHaveBeenCalledWith(project)
        expect(bridge.loadActionSchedules).toHaveBeenCalledWith(project, 'actions')
        expect(bridge.saveActionSchedules).toHaveBeenCalledWith(project, 'actions', [])
        expect(bridge.cancelActionSchedule).toHaveBeenCalledWith(project, 'actions', 'schedule-1')
        expect(bridge.listRepositoryFiles).toHaveBeenCalledWith(project)
        expect(bridge.listTopLevelFolders).toHaveBeenCalledWith(project)
        expect(bridge.createWorkingFolderFromTemplate).toHaveBeenCalledWith(project, 'design')
        expect(bridge.checkoutBranch).toHaveBeenCalledWith(project, 'feature')
        expect(bridge.commit).toHaveBeenCalled()
        expect(commitResult).toEqual([])
        expect(bridge.deleteFile).toHaveBeenCalled()
        expect(bridge.moveFiles).toHaveBeenCalled()
        expect(bridge.saveProjectConfig).toHaveBeenCalled()
        expect(bridge.push).toHaveBeenCalledWith(project)
    })

    it('delegates schedule payloads to the Electron bridge unchanged', async () => {
        const bridge = createBridge()
        const service = new LocalGitStorageService()
        const schedule: ActionSchedule = {
            actionName: 'implement',
            context: { file: 'design/F-022.md', kind: 'card', type: 'feature' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            status: 'pending',
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        }
        service.init({ bridge })

        const result = await service.saveActionSchedules({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, 'actions', [schedule])

        expect(bridge.saveActionSchedules).toHaveBeenCalledWith({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, 'actions', [schedule])
        expect(result).toEqual([schedule])
    })
})
