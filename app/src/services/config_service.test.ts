import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from '../data/data_types'
import { BUILTIN_AGENT_PROFILES, type AgentProfile } from '../data/agent_profiles'
import { CONFIG_ENTRIES, ConfigService, REACT_CONFIG_STORAGE_KEY, readStartupSplashPreference } from './config_service'

describe('ConfigService', () => {
    let service = new ConfigService()

    afterEach(() => {
        service.clear()
        service = new ConfigService()
        window.localStorage.clear()
    })

    it('merges project config over defaults', () => {
        service.init()
        service.loadProjectConfig({ actionsFolder: 'ops', pushMode: 'manual', workingFolder: 'docs' })

        expect(service.getProjectConfig()).toMatchObject({
            actionsFolder: 'ops',
            cardBodyTemplate: '# Goal\n\n# Current status\n\n# Details\n\n# Tasks',
            projectFolder: '',
            pushMode: 'manual',
            workingFolder: 'docs',
        })
        expect(service.getProjectConfig().cardTypes).toEqual(DEFAULT_CARD_TYPES)
    })

    it('narrows config values by key at compile time', () => {
        service.init()

        expectTypeOf(service.get('desktop.agent')).toEqualTypeOf<string>()
        expectTypeOf(service.get('desktop.agentProfiles')).toEqualTypeOf<AgentProfile[]>()
        expectTypeOf(service.get('react.autoCommitDelayMs')).toEqualTypeOf<number>()
        if (import.meta.env.MODE === 'typecheck') {
            // @ts-expect-error desktop.agent must stay string typed.
            service.set('desktop.agent', BUILTIN_AGENT_PROFILES)
        }
    })

    it('defaults the actions folder when project config omits it', () => {
        service.init()
        service.loadProjectConfig(null)

        expect(service.getProjectConfig().actionsFolder).toBe('actions')
    })

    it('loads the configured project folder', () => {
        service.init()
        service.loadProjectConfig({ projectFolder: 'projects/demo' })

        expect(service.getProjectConfig().projectFolder).toBe('projects/demo')
    })

    it('rejects folder paths that escape the project folder', () => {
        service.init()

        expect(() => service.loadProjectConfig({ projectFolder: '../outside' })).toThrow('must stay inside the project folder')
        expect(() => service.loadProjectConfig({ workingFolder: '../outside' })).toThrow('must stay inside the project folder')
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

    it('detects draft changes by config source', () => {
        service.init()
        service.loadProjectConfig(null)
        service.loadDraft()

        expect(service.hasDraftChangesForSource('react')).toBe(false)
        expect(service.hasDraftChangesForSource('project')).toBe(false)

        service.setDraftValue('react.showStartupSplash', false)

        expect(service.hasDraftChangesForSource('react')).toBe(true)
        expect(service.hasDraftChangesForSource('project')).toBe(false)

        service.setDraftValue('project.pushMode', 'manual')

        expect(service.hasDraftChangesForSource('project')).toBe(true)
    })

    it('shows desktop entries and loads desktop values when desktop config is available', () => {
        service.init()
        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)

        service.init({
            desktopConfig: {
                agent: 'claude',
                agentSlotCommand: 'slot-command',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'current-directory',
            },
        })

        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)
        expect(service.get('desktop.agent')).toBe('claude')
        expect(service.get('desktop.agentSlotCommand')).toBe('slot-command')
    })

    it('persists react and connection values across instances, simulating a reload', () => {
        service.init()
        service.loadDraft()
        service.setDraftValue('react.autoCommitDelayMs', 5000)
        service.setDraftValue('connection.githubScopes', 'public_repo')
        service.saveDraft()

        const reloaded = new ConfigService()
        reloaded.init()

        expect(reloaded.get('react.autoCommitDelayMs')).toBe(5000)
        expect(reloaded.get('connection.githubScopes')).toBe('public_repo')

        reloaded.clear()
    })

    it('falls back to defaults when stored react config is corrupted', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, 'not-json')

        expect(() => service.init()).not.toThrow()
        expect(service.get('react.autoCommitDelayMs')).toBe(30000)
        expect(service.get('react.showStartupSplash')).toBe(true)
    })

    it('ignores an out-of-range persisted value and keeps its default, without affecting other keys', () => {
        window.localStorage.setItem(
            REACT_CONFIG_STORAGE_KEY,
            JSON.stringify({ 'react.autoCommitDelayMs': 999999999, 'connection.githubScopes': 'public_repo' }),
        )

        service.init()

        expect(service.get('react.autoCommitDelayMs')).toBe(30000)
        expect(service.get('connection.githubScopes')).toBe('public_repo')
    })

    it('returns the current desktop values from getDesktopValues', () => {
        service.init({
            desktopConfig: {
                agent: 'claude',
                agentSlotCommand: 'slot-command',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'current-directory',
            },
        })

        expect(service.getDesktopValues()).toEqual({
            agent: 'claude',
            agentSlotCommand: 'slot-command',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            model: '',
            projectLocationMode: 'current-directory',
        })
    })

    it('reads the startup splash preference before init, defaulting to true', () => {
        expect(readStartupSplashPreference()).toBe(true)
    })

    it('reads a stored false startup splash preference before init', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.showStartupSplash': false }))

        expect(readStartupSplashPreference()).toBe(false)
    })

    it('requires slider number entries to define min and max', () => {
        const sliderEntries = CONFIG_ENTRIES.filter((entry) => entry.type === 'number' && entry.input === 'slider')

        expect(sliderEntries.length).toBeGreaterThan(0)
        expect(sliderEntries.every((entry) => entry.min !== undefined && entry.max !== undefined)).toBe(true)
    })
})
