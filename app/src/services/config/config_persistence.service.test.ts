import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import type { DesktopConfigValues } from './config_entries'
import {
    readDesktopConfigFromBridge,
    writeDesktopConfigToBridge,
} from './config_persistence'

describe('config persistence', () => {
    afterEach(() => {
        window.localStorage.clear()
        window.md2Config = undefined
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
