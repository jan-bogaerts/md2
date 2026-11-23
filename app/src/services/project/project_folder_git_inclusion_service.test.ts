import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../config/config_service'
import { dataService } from '../data/data_service'
import { hasProjectFolderGitInclusionDraftChange, ProjectFolderGitInclusionService } from './project_folder_git_inclusion_service'

function requireDraft() {
    const draft = configService.getDraft()
    if (!draft) throw new Error('Config draft is not loaded')

    return draft
}

function excludedDraft() {
    configService.loadDraft()
    configService.setDraftValue('project.includeProjectFolderInGit', false)
    configService.setDraftValue('project.deleteBranchAfterIntegration', true)

    return requireDraft()
}

describe('ProjectFolderGitInclusionService', () => {
    beforeEach(() => {
        configService.init()
        configService.loadProjectConfig(null)
        vi.spyOn(dataService.projectLoading, 'supportsLocalOnlyProjectFolder').mockReturnValue(true)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        configService.clear()
    })

    it('reports no draft change for storage that cannot keep the project folder local', () => {
        vi.mocked(dataService.projectLoading.supportsLocalOnlyProjectFolder).mockReturnValue(false)

        expect(hasProjectFolderGitInclusionDraftChange(excludedDraft())).toBe(false)
    })

    it('excludes an untracked project folder without asking for confirmation', async () => {
        vi.spyOn(dataService.projectLoading, 'hasTrackedProjectFolderFiles').mockResolvedValue(false)
        const persist = vi.spyOn(configService, 'setProjectFolderGitInclusion').mockResolvedValue()
        const service = new ProjectFolderGitInclusionService()
        const draft = excludedDraft()

        expect(hasProjectFolderGitInclusionDraftChange(draft)).toBe(true)
        await service.applyDraft(draft)

        expect(service.getPendingProjectFolder()).toBeNull()
        expect(persist).toHaveBeenCalledWith('design', false, false)
    })

    it('removes tracked files from the Git index after the user confirms', async () => {
        vi.spyOn(dataService.projectLoading, 'hasTrackedProjectFolderFiles').mockResolvedValue(true)
        const persist = vi.spyOn(configService, 'setProjectFolderGitInclusion').mockResolvedValue()
        const service = new ProjectFolderGitInclusionService()

        const applied = service.applyDraft(excludedDraft())
        await vi.waitFor(() => expect(service.getPendingProjectFolder()).toBe('design'))
        service.confirmRemoval()
        await applied

        expect(persist).toHaveBeenCalledWith('design', false, true)
        expect(service.getPendingProjectFolder()).toBeNull()
    })

    it('restores the draft setting and keeps unrelated draft changes when the user cancels', async () => {
        vi.spyOn(dataService.projectLoading, 'hasTrackedProjectFolderFiles').mockResolvedValue(true)
        const persist = vi.spyOn(configService, 'setProjectFolderGitInclusion').mockResolvedValue()
        const service = new ProjectFolderGitInclusionService()

        const applied = service.applyDraft(excludedDraft())
        await vi.waitFor(() => expect(service.getPendingProjectFolder()).toBe('design'))
        service.cancelRemoval()
        await applied

        expect(persist).not.toHaveBeenCalled()
        expect(configService.getDraft()?.['project.includeProjectFolderInGit']).toBe(true)
        expect(configService.getDraft()?.['project.deleteBranchAfterIntegration']).toBe(true)
        expect(configService.get('project.includeProjectFolderInGit')).toBe(true)
    })

    it('re-includes the project folder without inspecting tracked files', async () => {
        configService.loadProjectConfig({ includeProjectFolderInGit: false })
        const hasTrackedFiles = vi.spyOn(dataService.projectLoading, 'hasTrackedProjectFolderFiles')
        const persist = vi.spyOn(configService, 'setProjectFolderGitInclusion').mockResolvedValue()
        const service = new ProjectFolderGitInclusionService()
        configService.loadDraft()
        configService.setDraftValue('project.includeProjectFolderInGit', true)

        await service.applyDraft(requireDraft())

        expect(hasTrackedFiles).not.toHaveBeenCalled()
        expect(persist).toHaveBeenCalledWith('design', true, false)
    })
})
