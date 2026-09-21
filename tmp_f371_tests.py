p = 'app/src/services/config/config_service.service.test.ts'
s = open(p, encoding='utf-8').read()

s = s.replace(
    "import { CONFIG_ENTRIES, ConfigService, REACT_CONFIG_STORAGE_KEY, readStartupSplashPreference } from './config_service'",
    "import { CONFIG_ENTRIES, ConfigService } from './config_service'")
s = s.replace("expectTypeOf(service.get('react.autoCommitDelayMs')).toEqualTypeOf<number>()",
              "expectTypeOf(service.get('project.autoCommitDelayMs')).toEqualTypeOf<number>()")

s = s.replace("""    it('replaces desktop values without clearing project or React values', () => {
        service.init()
        service.setReactPreference('react.showStartupSplash', false)
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })""",
"""    it('replaces desktop values without clearing project values', () => {
        service.init()
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })""")

s = s.replace("""        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
        expect(service.get('react.showStartupSplash')).toBe(false)
    })

    it('clears only desktop values and marks them unavailable', () => {
        service.init({ desktopConfig: { agentSelection: agentSelection('claude') } })
        service.setReactPreference('react.showStartupSplash', false)
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })""",
"""        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
    })

    it('clears only desktop values and marks them unavailable', () => {
        service.init({ desktopConfig: { agentSelection: agentSelection('claude') } })
        service.loadProjectConfig({ actionsFolder: 'ops', workingFolder: 'docs' })""")

s = s.replace("""        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
        expect(service.get('react.showStartupSplash')).toBe(false)
    })

    it('defaults the actions folder when project config omits it', () => {""",
"""        expect(service.getProjectConfig()).toMatchObject({ actionsFolder: 'ops', workingFolder: 'docs' })
    })

    it('defaults the actions folder when project config omits it', () => {""")

s = s.replace("""        expect(service.hasDraftChangesForSource('react')).toBe(false)
        expect(service.hasDraftChangesForSource('project')).toBe(false)

        service.setDraftValue('react.showStartupSplash', false)

        expect(service.hasDraftChangesForSource('react')).toBe(true)
        expect(service.hasDraftChangesForSource('project')).toBe(false)""",
"""        expect(service.hasDraftChangesForSource('desktop')).toBe(false)
        expect(service.hasDraftChangesForSource('project')).toBe(false)

        service.setDraftValue('desktop.editorCommand', 'notepad "{{file}}"')

        expect(service.hasDraftChangesForSource('desktop')).toBe(true)
        expect(service.hasDraftChangesForSource('project')).toBe(false)""")

old_persistence_cases = """    it('persists react values across instances, simulating a reload', () => {
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
"""

new_persistence_cases = """    it('defaults branch cleanup and auto commit delay when the project config file omits them', () => {
        service.init()
        service.loadProjectConfig({ workingFolder: 'docs' })

        expect(service.get('project.deleteBranchAfterIntegration')).toBe(false)
        expect(service.get('project.deleteBranchesAfterRelease')).toBe(false)
        expect(service.get('project.autoCommitDelayMs')).toBe(30000)
    })

    it('persists one project preference through the project config boundary and into an open draft', async () => {
        const saveProjectConfig = vi.fn(async () => undefined)
        service.init()
        service.connectProjectConfigPersistence({ saveProjectConfig })
        service.loadProjectConfig(null)
        service.loadDraft()

        await service.setProjectPreference('project.deleteBranchesAfterRelease', true)

        expect(saveProjectConfig).toHaveBeenCalledWith(expect.objectContaining({ deleteBranchesAfterRelease: true }))
        expect(service.get('project.deleteBranchesAfterRelease')).toBe(true)
        expect(service.getDraft()?.['project.deleteBranchesAfterRelease']).toBe(true)
    })

    it('ignores a project preference write while no project is open', async () => {
        const saveProjectConfig = vi.fn(async () => undefined)
        service.init()
        service.connectProjectConfigPersistence({ saveProjectConfig })

        await service.setProjectPreference('project.deleteBranchAfterIntegration', true)

        expect(saveProjectConfig).not.toHaveBeenCalled()
        expect(service.get('project.deleteBranchAfterIntegration')).toBe(false)
    })
"""

assert old_persistence_cases in s
s = s.replace(old_persistence_cases, new_persistence_cases)

old_splash_cases = """    it('reads the startup splash preference before init, defaulting to true', () => {
        expect(readStartupSplashPreference()).toBe(true)
    })

    it('reads a stored false startup splash preference before init', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.showStartupSplash': false }))

        expect(readStartupSplashPreference()).toBe(false)
    })

"""
assert old_splash_cases in s
s = s.replace(old_splash_cases, "")

open(p, 'w', encoding='utf-8', newline='').write(s)
print('done')
