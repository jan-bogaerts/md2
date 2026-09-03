import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_CONFIG } from '../../data/data_types'
import { BUILTIN_CUSTOM_PROMPT } from '../../data/action_types'
import { ActionService } from '../actions/action_service'
import { runElectronAction } from '../actions/electron_action_runner'
import { configService } from '../config/config_service'
import { createDataService, createStorage, githubProject } from '../test_support/data_service_test_support'
import { projectAccessService, READ_ONLY_PROJECT_ERROR } from './project_access_service'

describe('read-only project service guards', () => {
    beforeEach(() => {
        configService.init()
        projectAccessService.setReadOnly(false)
    })

    afterEach(() => {
        projectAccessService.setReadOnly(false)
        configService.clear()
        vi.restoreAllMocks()
    })

    it('blocks card, file, config, and release mutations before storage writes', async () => {
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject(githubProject)
        projectAccessService.setReadOnly(true)

        await expect(service.cards.createCard({ body: '', title: 'Blocked', type: 'feature' }, 'new')).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.cards.createMarkdownFile('design', 'blocked')).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.projectLoading.saveProjectConfig()).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.saveProjectConfig).not.toHaveBeenCalled()
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('blocks action editing and execution before persistence or bridge calls', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        projectAccessService.setReadOnly(true)

        expect(() => service.createDefinition(DEFAULT_PROJECT_CONFIG.actionsFolder)).toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(runElectronAction(BUILTIN_CUSTOM_PROMPT, { kind: 'project' })).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        expect(persistActionFile).not.toHaveBeenCalled()
    })
})
