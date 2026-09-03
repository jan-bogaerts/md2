import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_DIAGRAM_FOOTER, DEFAULT_STATES, defaultColumnAccent, resolveProjectConfigPaths } from '../../data/data_types'
import { BUILTIN_AGENT_PROFILES, type AgentProfile } from '../../data/agent_profiles'
import { CONFIG_ENTRIES, ConfigService, REACT_CONFIG_STORAGE_KEY, readStartupSplashPreference } from './config_service'

function agentSelection(activeAgent: string, model = '', thinkingLevel: 'none' | 'high' = 'none') {
    return { activeAgent, permissionMode: 'ask-for-approval' as const, settingsByAgent: { [activeAgent]: { model, thinkingLevel } } }
}

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
            archivedFolder: 'archived',
            backgroundShade: 'green',
            cardSeparator: '-',
            diagramFooter: DEFAULT_DIAGRAM_FOOTER,
            diagramsFolder: 'diagrams',
            projectFolder: 'design',
            pushMode: 'manual',
            releasesFolder: 'history',
            workingFolder: 'docs',
        })
        expect(service.getProjectConfig().cardTypes).toEqual(DEFAULT_CARD_TYPES)
        expect(service.getProjectConfig().states).toEqual(DEFAULT_STATES)
        expect(service.getProjectConfig().diagramFooter).toContain('Save one version 1 JSON object')
        expect(service.getProjectConfig().diagramFooter).toContain('architecture, dependency, sequence, flow, entity')
    })

    it('ignores obsolete card body templates and omits them from saved project config', () => {
        service.init()
        const existingConfig = { cardBodyTemplate: '# Legacy template', workingFolder: 'docs' }

        service.loadProjectConfig(existingConfig)

        expect(service.getEntries().some(({ key }) => String(key) === 'project.cardBodyTemplate')).toBe(false)
        expect(service.getProjectConfig()).not.toHaveProperty('cardBodyTemplate')
    })

    it('narrows config values by key at compile time', () => {
        service.init()

        expectTypeOf(service.get('desktop.agentSelection').activeAgent).toEqualTypeOf<string>()
        expectTypeOf(service.get('desktop.agentProfiles')).toEqualTypeOf<AgentProfile[]>()
        expectTypeOf(service.get('react.autoCommitDelayMs')).toEqualTypeOf<number>()
        if (import.meta.env.MODE === 'typecheck') {
            // @ts-expect-error desktop.agentSelection must stay selection typed.
            service.set('desktop.agentSelection', BUILTIN_AGENT_PROFILES)
        }
    })

    it('replaces desktop values without clearing project or React values', () => {
        service.init()
        service.setReactPreference('react.showStartupSplash', false)
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })
        service.replaceDesktopConfig({
            agentSelection: agentSelection('custom', 'custom-model', 'high'),
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none', models: ['custom-model'], name: 'custom' }],
            codexSearchEnabled: false,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
        })

        expect(service.hasDesktopConfig()).toBe(true)
        expect(service.getDesktopValues()).toMatchObject({ agentSelection: agentSelection('custom', 'custom-model', 'high') })
        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
        expect(service.get('react.showStartupSplash')).toBe(false)
    })

    it('clears only desktop values and marks them unavailable', () => {
        service.init({ desktopConfig: { agentSelection: agentSelection('claude') } })
        service.setReactPreference('react.showStartupSplash', false)
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })
        service.loadDraft()
        service.clearDesktopConfig()

        expect(service.hasDesktopConfig()).toBe(false)
        expect(service.get('desktop.agentSelection').activeAgent).toBe('codex')
        expect(service.getDraft()?.['desktop.agentSelection'].activeAgent).toBe('codex')
        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
        expect(service.get('react.showStartupSplash')).toBe(false)
    })

    it('defaults the actions folder when project config omits it', () => {
        service.init()
        service.loadProjectConfig(null)

        expect(service.getProjectConfig().actionsFolder).toBe('actions')
    })

    it('defaults push mode to manual and preserves explicit values', () => {
        service.init()
        service.loadProjectConfig(null)

        expect(service.getProjectConfig().pushMode).toBe('manual')

        service.loadProjectConfig({ workingFolder: 'docs' })

        expect(service.getProjectConfig().pushMode).toBe('manual')

        service.loadProjectConfig({ pushMode: 'auto' })

        expect(service.getProjectConfig().pushMode).toBe('auto')

        service.loadProjectConfig({ pushMode: 'manual' })

        expect(service.getProjectConfig().pushMode).toBe('manual')
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
        expect(() => service.loadProjectConfig({ archivedFolder: '/outside' })).toThrow('must be repository-relative')
        expect(() => service.loadProjectConfig({ releasesFolder: '' })).toThrow('Missing config field')
    })

    it('normalizes and resolves configured project subfolders', () => {
        service.init()
        service.loadProjectConfig({
            actionsFolder: 'automation',
            archivedFolder: 'records\\archived',
            diagramsFolder: 'visuals',
            projectFolder: 'projects/demo',
            releasesFolder: 'records//releases',
            workingFolder: 'active',
        })

        expect(resolveProjectConfigPaths(service.getProjectConfig())).toMatchObject({
            actionsFolder: 'projects/demo/automation',
            archivedFolder: 'projects/demo/records/archived',
            diagramsFolder: 'projects/demo/visuals',
            releasesFolder: 'projects/demo/records/releases',
            workingFolder: 'projects/demo/active',
        })
    })

    it('rejects conflicting project subfolder paths', () => {
        service.init()

        expect(() => service.loadProjectConfig({ archivedFolder: 'records', releasesFolder: 'RECORDS' })).toThrow('must not overlap')
        expect(() => service.loadProjectConfig({ archivedFolder: 'records/archived', releasesFolder: 'records' })).toThrow('must not overlap')
        expect(() => service.loadProjectConfig({ diagramsFolder: 'records', releasesFolder: 'records/releases' })).toThrow('must not overlap')
    })

    it('loads and validates diagram output config', () => {
        service.init()
        service.loadProjectConfig({
            diagramFooter: 'Render requested view. Save SVG to {{diagram-file}}.',
            diagramsFolder: 'generated/diagrams',
        })

        expect(service.getProjectConfig()).toMatchObject({
            diagramFooter: 'Render requested view. Save SVG to {{diagram-file}}.',
            diagramsFolder: 'generated/diagrams',
        })
        expect(() => service.loadProjectConfig({ diagramFooter: '' })).toThrow('project.diagramFooter')
        expect(() => service.loadProjectConfig({ diagramFooter: 'Render SVG.' })).toThrow('requires {{diagram-file}} placeholder')
        expect(() => service.loadProjectConfig({ diagramsFolder: '../outside' })).toThrow('must stay inside the project folder')
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
            { alwaysVisible: true, color: '#123456', defaultActionId: 'refine', state: 'backlog' },
            { alwaysVisible: false, state: 'shipped' },
        ]

        service.loadProjectConfig({ backgroundShade: 'purple', states })

        expect(service.getProjectConfig().states).toEqual([
            states[0],
            { ...states[1], color: defaultColumnAccent(1) },
        ])
    })

    it('omits absent default action ids from project states', () => {
        service.init()
        service.loadProjectConfig({ states: [{ alwaysVisible: true, state: 'backlog' }] })

        expect(service.getProjectConfig().states[0]).not.toHaveProperty('defaultActionId')
    })

    it.each([null, '', 7])('rejects invalid project state default action id %j', (defaultActionId) => {
        service.init()
        const states = [{ alwaysVisible: true, defaultActionId, state: 'backlog' }]

        expect(() => service.loadProjectConfig({ states } as never)).toThrow('project.states[0].defaultActionId')
    })

    it('keeps active values unchanged when a draft is discarded', () => {
        service.init()
        service.loadProjectConfig(null)
        service.loadDraft()
        service.setDraftValue('project.pushMode', 'auto')
        service.discardDraft()

        expect(service.getProjectConfig().pushMode).toBe('manual')
    })

    it('applies validated draft values on save', () => {
        service.init()
        service.loadProjectConfig(null)
        service.loadDraft()
        service.setDraftValue('project.pushMode', 'auto')
        service.saveDraft()

        expect(service.getProjectConfig().pushMode).toBe('auto')
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

        service.setDraftValue('project.pushMode', 'auto')

        expect(service.hasDraftChangesForSource('project')).toBe(true)
    })

    it('shows desktop entries and loads desktop values when desktop config is available', () => {
        service.init()
        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)

        service.init({
            desktopConfig: {
                agentSelection: agentSelection('claude', '', 'high'),
                agentProfiles: BUILTIN_AGENT_PROFILES,
                editorCommand: 'notepad "{{file}}"',
                mergeConflictResolverCommand: 'merge-tool "{{file}}"',
            },
        })

        expect(service.getEntries().some((entry) => entry.source === 'desktop')).toBe(true)
        expect(service.get('desktop.agentSelection').activeAgent).toBe('claude')
        expect(service.get('desktop.editorCommand')).toBe('notepad "{{file}}"')
        expect(service.get('desktop.mergeConflictResolverCommand')).toBe('merge-tool "{{file}}"')
        expect(service.get('desktop.agentSelection').settingsByAgent.claude.thinkingLevel).toBe('high')
    })

    it('normalizes legacy profiles when remote desktop config replaces renderer config', () => {
        service.init()

        service.replaceDesktopConfig({agentProfiles: [{ command: ['remote-agent'], models: ['remote-model'], name: 'remote' }] as never})

        expect(service.get('desktop.agentProfiles')).toEqual([{
            command: ['remote-agent'],
            defaultThinkingLevel: 'none',
            models: ['remote-model'],
            name: 'remote',
        }])
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

    it('persists integration and release branch cleanup preferences immediately', () => {
        service.init()
        service.setReactPreference('react.deleteBranchAfterIntegration', true)
        service.setReactPreference('react.deleteBranchesAfterRelease', true)

        const reloaded = new ConfigService()
        reloaded.init()

        expect(reloaded.get('react.deleteBranchAfterIntegration')).toBe(true)
        expect(reloaded.get('react.deleteBranchesAfterRelease')).toBe(true)
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
                agentSelection: agentSelection('claude', '', 'high'),
                agentProfiles: BUILTIN_AGENT_PROFILES,
                editorCommand: 'notepad "{{file}}"',
                mergeConflictResolverCommand: 'merge-tool "{{file}}"',
            },
        })

        expect(service.getDesktopValues()).toEqual({
            agentSelection: agentSelection('claude', '', 'high'),
            agentProfiles: BUILTIN_AGENT_PROFILES,
            codexSearchEnabled: true,
            editorCommand: 'notepad "{{file}}"',
            mergeConflictResolverCommand: 'merge-tool "{{file}}"',
            remoteControlPort: 20877,
        })
    })

    it('requires editor command to contain file placeholder', () => {
        service.init()
        service.loadDraft()

        expect(() => service.setDraftValue('desktop.editorCommand', 'notepad')).toThrow('requires {{file}} placeholder')
    })

    it('allows an empty merge resolver command and requires file placeholder when configured', () => {
        service.init()
        service.loadDraft()

        expect(() => service.setDraftValue('desktop.mergeConflictResolverCommand', '')).not.toThrow()
        expect(() => service.setDraftValue('desktop.mergeConflictResolverCommand', 'merge-tool')).toThrow('requires {{file}} placeholder')
        expect(() => service.setDraftValue('desktop.mergeConflictResolverCommand', 'merge-tool "{{file}}"')).not.toThrow()
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
