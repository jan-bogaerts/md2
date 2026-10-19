import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeBridgeError } from '../../../../shared/bridge_errors.mjs'
import { dialogService } from '../dialog_service'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { RECENT_LOCAL_REPOSITORIES_STORAGE_KEY } from '../../data/recent_local_repositories'
import { applicationStorage } from '../storage/application_storage'
import { createDeferred } from '../test_support/data_service_test_support'
import { projectSessionService, type ProjectOpenResolution } from './project_session_service'
import { ProjectOpenFlowService } from './project_open_flow_service'

const LOCAL_PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

function folderSetupResolution(): ProjectOpenResolution {
    return {
        existingFolderPaths: [],
        folders: [],
        hasProjectConfig: false,
        kind: 'project-folder-setup',
        project: LOCAL_PROJECT,
        storageType: 'local',
        values: {
            actionsFolder: 'actions',
            archivedFolder: 'archived',
            diagramsFolder: 'diagrams',
            projectFolder: 'design',
            releasesFolder: 'history',
            workingFolder: 'active',
        },
    }
}

describe('ProjectOpenFlowService', () => {
    beforeEach(() => {
        window.md2Data = {resolveProject: vi.fn(async () => LOCAL_PROJECT)} as unknown as ElectronDataBridge
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        window.md2Data = undefined
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
    })

    it.each(['picker', 'path'] as const)('reports the original %s error without treating it as a project', async (source) => {
        const failure = serializeBridgeError(new Error('Selected folder is not a Git repository'))
        window.md2Data = {
            openProjectFolder: vi.fn(async () => failure),
            resolveProject: vi.fn(async () => failure),
        } as unknown as ElectronDataBridge
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        const reportError = vi.spyOn(dialogService, 'error')
        const service = new ProjectOpenFlowService()
        service.show()

        if (source === 'picker') await service.chooseLocalFolder()
        else await service.submit({ source: 'local', rootPath: '/projects/example' })

        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Selected folder is not a Git repository' }),
            { fallbackMessage: 'Local project selection failed' },
        )
        expect(openProject).not.toHaveBeenCalled()
    })

    it('reports the original subfolder picker error and keeps the setup form', async () => {
        window.md2Data = {selectProjectSubFolder: vi.fn(async () => serializeBridgeError(new Error('Folder picker unavailable')))} as unknown as ElectronDataBridge
        const reportError = vi.spyOn(dialogService, 'error')
        const resolution = folderSetupResolution()
        const service = new ProjectOpenFlowService()
        service.show({ resolution })

        await expect(service.browseFolder('projectFolder', resolution.values)).resolves.toBeNull()

        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Folder picker unavailable' }),
            { fallbackMessage: 'Project folder selection failed' },
        )
        expect(service.getPhase()).toBe('folder-setup')
    })

    it('closes the input phase before loading and keeps it closed through recent-project persistence', async () => {
        const service = new ProjectOpenFlowService()
        const openProject = createDeferred<null>()
        const writeRecent = createDeferred<void>()
        vi.spyOn(projectSessionService, 'openProject').mockReturnValue(openProject.promise)
        vi.spyOn(applicationStorage, 'writeCurrentItem').mockReturnValue(writeRecent.promise)
        service.setAuthentication('token', false)
        service.show()

        const submitted = service.submit({ source: 'local', rootPath: 'C:/repo' })
        expect(service.getPhase()).toBe('loading')

        openProject.resolve(null)
        await vi.waitFor(() => expect(applicationStorage.writeCurrentItem).toHaveBeenCalledOnce())
        expect(service.getPhase()).toBe('loading')

        writeRecent.resolve()
        await submitted
        expect(service.getPhase()).toBe('closed')
    })

    it('opens folder setup after a project requests it and keeps the selected local root for confirmation', async () => {
        const service = new ProjectOpenFlowService()
        const resolution = folderSetupResolution()
        vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(resolution)
        const confirm = vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockResolvedValue(undefined)
        service.setAuthentication('token', false)
        service.show()

        await service.submit({ source: 'local', rootPath: 'C:/repo' })
        expect(service.getPhase()).toBe('folder-setup')
        expect(service.getSnapshot().folderValues).toEqual(resolution.values)

        await service.confirmFolders(resolution.values)
        expect(confirm).toHaveBeenCalledWith(resolution, resolution.values, 'token')
        expect(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)).toContain('C:/repo')
        expect(service.getPhase()).toBe('closed')
    })

    it('restores the folder form with submitted values when confirmation fails', async () => {
        const service = new ProjectOpenFlowService()
        const resolution = folderSetupResolution()
        vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockRejectedValue(new Error('Save failed'))
        service.setAuthentication('token', false)
        service.show({ resolution })
        const values = { ...resolution.values, workingFolder: 'current' }

        await service.confirmFolders(values)

        expect(service.getPhase()).toBe('folder-setup')
        expect(service.getSnapshot().folderValues).toEqual(values)
    })

    it('opens a GitHub repository on the chosen branch and closes the flow', async () => {
        const service = new ProjectOpenFlowService()
        const repository = { branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }
        vi.spyOn(projectSessionService, 'findGithubRepositoryBranches').mockResolvedValue({ branches: [{ name: 'develop' }], repository })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        service.setAuthentication('token', true)
        service.show({ source: 'personal' })

        await service.submit({ source: 'personal', owner: 'octo', repository: 'demo', branch: 'develop' })

        expect(openProject).toHaveBeenCalledWith('github', { ...repository, branch: 'develop' }, 'token')
        expect(service.getPhase()).toBe('closed')
    })

    describe('openStartupProject', () => {
        it('opens the startup folder and records it as the newest recent folder', async () => {
            const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
            const service = new ProjectOpenFlowService()

            await service.openStartupProject('C:/repo')

            expect(window.md2Data?.resolveProject).toHaveBeenCalledWith({ branch: '', id: 'C:/repo', rootPath: 'C:/repo' })
            expect(openProject).toHaveBeenCalledWith('local', LOCAL_PROJECT, null)
            expect(JSON.parse(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY) ?? '[]')[0]).toBe('C:/repo')
            expect(service.getPhase()).toBe('closed')
        })

        it('records a startup folder needing setup only after the folders are confirmed', async () => {
            const resolution = folderSetupResolution()
            vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(resolution)
            vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockResolvedValue(undefined)
            const service = new ProjectOpenFlowService()

            await service.openStartupProject('C:/repo')

            expect(service.getPhase()).toBe('folder-setup')
            expect(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)).toBeNull()

            await service.confirmFolders(resolution.values)

            expect(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)).toContain('C:/repo')
        })

        it('reports a folder that cannot be resolved and shows the local open dialog', async () => {
            window.md2Data = {resolveProject: vi.fn(async () => serializeBridgeError(new Error('Folder is not inside a Git work tree')))} as unknown as ElectronDataBridge
            const openProject = vi.spyOn(projectSessionService, 'openProject')
            const reportError = vi.spyOn(dialogService, 'error')
            const service = new ProjectOpenFlowService()

            await service.openStartupProject('C:/missing')

            expect(reportError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Folder is not inside a Git work tree' }),
                { fallbackMessage: 'Could not open project folder' },
            )
            expect(openProject).not.toHaveBeenCalled()
            expect(service.getPhase()).toBe('selecting')
            expect(service.getValue('source')).toBe('local')
        })

        it('shows the local open dialog without reporting twice when loading fails', async () => {
            vi.spyOn(projectSessionService, 'openProject').mockRejectedValue(new Error('Project load failed'))
            const reportError = vi.spyOn(dialogService, 'error')
            const service = new ProjectOpenFlowService()

            await service.openStartupProject('C:/repo')

            expect(reportError).not.toHaveBeenCalled()
            expect(service.getPhase()).toBe('selecting')
            expect(service.getValue('source')).toBe('local')
        })
    })
})
