import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { configService } from '../../services/config/config_service'
import { useConfigValue } from './use_config_value'

describe('useConfigValue', () => {
    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
    })

    it('updates when the config service emits changed', () => {
        configService.init({
            desktopConfig: {
                agentProfiles: [{ command: ['codex'], defaultThinkingLevel: 'none', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: 'gpt-5', thinkingLevel: 'none' } } },
            },
        })
        const { result } = renderHook(() => useConfigValue('desktop.agentSelection'))

        expect(result.current.activeAgent).toBe('codex')

        act(() => {
            configService.set('desktop.agentSelection', { ...result.current, activeAgent: 'system' })
        })

        expect(result.current.activeAgent).toBe('system')
    })
})
