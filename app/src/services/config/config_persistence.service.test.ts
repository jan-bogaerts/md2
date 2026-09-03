import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import { createDefaultValues, type ConfigValues, type DesktopConfigValues } from './config_entries'
import {
    mergeStoredReactValues,
    REACT_CONFIG_STORAGE_KEY,
    readDesktopConfigFromBridge,
    readStartupSplashPreference,
    readStoredReactValues,
    writeDesktopConfigToBridge,
    writeStoredReactValues,
} from './config_persistence'

describe('config persistence', () => {
    afterEach(() => {
        window.localStorage.clear()
        window.md2Config = undefined
    })

    it('reads empty values when stored react config is missing or invalid', () => {
        expect(readStoredReactValues()).toEqual({})

        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, 'not-json')

        expect(readStoredReactValues()).toEqual({})
    })

    it('writes only react scoped values', () => {
        const values = { ...createDefaultValues(), 'react.autoCommitDelayMs': 5000, 'desktop.agent': 'claude' }

        writeStoredReactValues(values)

        expect(JSON.parse(window.localStorage.getItem(REACT_CONFIG_STORAGE_KEY) ?? '{}')).toEqual({
            'react.autoCommitDelayMs': 5000,
            'react.deleteBranchAfterIntegration': false,
            'react.deleteBranchesAfterRelease': false,
            'react.includeProjectActivityInRelease': false,
            'react.showStartupSplash': true,
        })
    })

    it('merges stored react values through the supplied validator', () => {
        const values = createDefaultValues()
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.autoCommitDelayMs': 5000 }))

        const mergedValues = mergeStoredReactValues(
            values,
            (currentValues, key, value) => ({ ...currentValues, [key]: value } as ConfigValues),
        )

        expect(mergedValues['react.autoCommitDelayMs']).toBe(5000)
    })

    it('keeps defaults when startup splash preference is missing', () => {
        expect(readStartupSplashPreference()).toBe(true)
    })

    it('reads and writes desktop config through the bridge', () => {
        const desktopConfig: DesktopConfigValues = {
            agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: '', thinkingLevel: 'none' } } },
            agentProfiles: BUILTIN_AGENT_PROFILES,
            editorCommand: 'code -g "{{file}}:{{line}}"',
            mergeConflictResolverCommand: '',
            remoteControlPort: 20877,
        }
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        window.md2Config = {
            getDesktopConfig: () => desktopConfig,
            setDesktopConfig,
        }

        expect(readDesktopConfigFromBridge()).toBe(desktopConfig)
        writeDesktopConfigToBridge(desktopConfig)

        expect(setDesktopConfig).toHaveBeenCalledWith(desktopConfig)
    })
})
