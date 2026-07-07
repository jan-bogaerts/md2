import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from '../data/data_types'
import { BUILTIN_AGENT_PROFILES, type AgentProfile } from '../data/agent_profiles'
import { ConfigService, REACT_CONFIG_STORAGE_KEY, readStartupSplashPreference } from './config_service'

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
})
