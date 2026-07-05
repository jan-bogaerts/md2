import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from '../data/data_types'
import { ConfigService } from './config_service'

describe('ConfigService', () => {
    let service = new ConfigService()

    afterEach(() => {
        service.clear()
        service = new ConfigService()
    })

    it('merges project config over defaults', () => {
        service.init()
        service.loadProjectConfig({ actionsFolder: 'ops', pushMode: 'manual', workingFolder: 'docs' })

        expect(service.getProjectConfig()).toMatchObject({
            actionsFolder: 'ops',
            cardBodyTemplate: '# Goal\n\n# Current status\n\n# Details\n\n# Tasks',
            pushMode: 'manual',
            workingFolder: 'docs',
        })
        expect(service.getProjectConfig().cardTypes).toEqual(DEFAULT_CARD_TYPES)
    })

    it('defaults the actions folder when project config omits it', () => {
        service.init()
        service.loadProjectConfig(null)

        expect(service.getProjectConfig().actionsFolder).toBe('actions')
    })

    it('rejects invalid project config values', () => {
        service.init()

        expect(() => service.loadProjectConfig({ pushMode: 'sometimes' as never })).toThrow('Invalid config value')
    })

    it('keeps active values unchanged when a draft is discarded', () => {
        service.init()
        service.loadProjectConfig(null)
        service.loadDraft()
        service.setDraftValue('project.pushMode', 'manual')
        service.discardDraft()

        expect(service.getProjectConfig().pushMode).toBe('auto')
    })

    it('applies validated draft values on save', () => {
        service.init()
        service.loadProjectConfig(null)
        service.loadDraft()
        service.setDraftValue('project.pushMode', 'manual')
        service.saveDraft()

        expect(service.getProjectConfig().pushMode).toBe('manual')
    })

    it('shows desktop entries only when desktop config is available', () => {
        service.init()
        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(false)

        service.init({ desktopConfig: { agent: 'system', projectLocationMode: 'current-directory' } })

        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)
        expect(service.get('desktop.agent')).toBe('system')
    })
})
