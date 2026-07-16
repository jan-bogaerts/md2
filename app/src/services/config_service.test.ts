import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES, defaultColumnAccent } from '../data/data_types'
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
        service.loadProjectConfig({ actionsFolder: 'ops', backgroundShade: 'green', pushMode: 'manual', workingFolder: 'docs' })

        expect(service.getProjectConfig()).toMatchObject({
            actionsFolder: 'ops',
            backgroundShade: 'green',
            cardBodyTemplate: '# Goal\n\n# Current status\n\n# Details\n\n# Tasks',
            cardSeparator: '-',
            projectFolder: 'design',
            pushMode: 'manual',
            workingFolder: 'docs',
        })
        expect(service.getProjectConfig().cardTypes).toEqual(DEFAULT_CARD_TYPES)
        expect(service.getProjectConfig().states).toEqual(DEFAULT_STATES)
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

    it('defaults new projects to underscore and identifies existing configs without the key as legacy hyphen projects', () => {
        service.init()
        service.loadProjectConfig(null)

        expect(service.getProjectConfig().cardSeparator).toBe('_')

        service.loadProjectConfig({ workingFolder: 'design' })

        expect(service.getProjectConfig().cardSeparator).toBe('-')
    })

    it('loads a configured card separator and rejects unsupported values', () => {
        service.init()
        service.loadProjectConfig({ cardSeparator: '-' })

        expect(service.getProjectConfig().cardSeparator).toBe('-')
        expect(() => service.loadProjectConfig({ cardSeparator: '.' as never })).toThrow('Invalid config value')
    })

    it('loads the configured project folder', () => {
        service.init()
        service.loadProjectConfig({ backgroundShade: 'blue', projectFolder: 'projects/demo' })

        expect(service.getProjectConfig().projectFolder).toBe('projects/demo')
    })

    it('rejects folder paths that escape the project folder', () => {
        service.init()

        expect(() => service.loadProjectConfig({ backgroundShade: 'blue', projectFolder: '../outside' })).toThrow('must stay inside the project folder')
        expect(() => service.loadProjectConfig({ backgroundShade: 'blue', workingFolder: '../outside' })).toThrow('must stay inside the project folder')
    })

    it('rejects invalid project config values', () => {
        service.init()

        expect(() => service.loadProjectConfig({ backgroundShade: 'blue', pushMode: 'sometimes' as never })).toThrow('Invalid config value')
        expect(() => service.loadProjectConfig({ backgroundShade: 'blue', states: [{ alwaysVisible: true, state: 'new' }, { alwaysVisible: false, state: 'new' }] })).toThrow('duplicate states')
    })

    it('uses the default background shade when stored project config omits it', () => {
        service.init()

        service.loadProjectConfig({ workingFolder: 'docs' })

        expect(service.getProjectConfig().backgroundShade).toBe('neutral')
    })

    it('rejects unsupported project background shades', () => {
        service.init()

        expect(() => service.loadProjectConfig({ backgroundShade: 'cyan' as never })).toThrow('Invalid config value')
    })

    it('loads project states in their configured order', () => {
        service.init()
        const states = [
            { alwaysVisible: true, color: '#123456', state: 'backlog' },
            { alwaysVisible: false, state: 'shipped' },
        ]

        service.loadProjectConfig({ backgroundShade: 'purple', states })

        expect(service.getProjectConfig().states).toEqual([
            states[0],
            { ...states[1], color: defaultColumnAccent(1) },
        ])
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
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                thinkingLevel: 'high',
            },
        })

        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)
        expect(service.get('desktop.agent')).toBe('claude')
        expect(service.get('desktop.thinkingLevel')).toBe('high')
    })

    it('persists react values across instances, simulating a reload', () => {
        service.init()
        service.loadDraft()
        service.setDraftValue('react.autoCommitDelayMs', 5000)
        service.setDraftValue('react.showStartupSplash', false)
        service.saveDraft()

        const reloaded = new ConfigService()
        reloaded.init()

        expect(reloaded.get('react.autoCommitDelayMs')).toBe(5000)
        expect(reloaded.get('react.showStartupSplash')).toBe(false)

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
            JSON.stringify({ 'react.autoCommitDelayMs': 999999999, 'react.showStartupSplash': false }),
        )

        service.init()

        expect(service.get('react.autoCommitDelayMs')).toBe(30000)
        expect(service.get('react.showStartupSplash')).toBe(false)
    })

    it('returns the current desktop values from getDesktopValues', () => {
        service.init({
            desktopConfig: {
                agent: 'claude',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                thinkingLevel: 'high',
            },
        })

        expect(service.getDesktopValues()).toEqual({
            agent: 'claude',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            codexSearchEnabled: true,
            model: '',
            thinkingLevel: 'high',
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
