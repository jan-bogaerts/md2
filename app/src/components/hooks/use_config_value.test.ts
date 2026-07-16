import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { configService } from '../../services/config_service'
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
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: [{ command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const { result } = renderHook(() => useConfigValue('desktop.agent'))

        expect(result.current).toBe('codex')

        act(() => {
            configService.set('desktop.agent', 'system')
        })

        expect(result.current).toBe('system')
    })
})
