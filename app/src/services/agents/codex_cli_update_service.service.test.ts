import { describe, expect, it, vi } from 'vitest'
import type { ElectronCodexRuntimeBridge } from '../../data/electron_codex_runtime_bridge'
import { DialogService, type DialogServiceMessage } from '../dialog_service'
import { CodexCliUpdateService } from './codex_cli_update_service'

function bridge() {
    let updateListener: ((update: { cacheVersion: string, runningVersion: string }) => void) | null = null
    const value: ElectronCodexRuntimeBridge = {
        getCodexRateLimits: vi.fn(async () => null),
        onCodexRateLimits: vi.fn(() => vi.fn()),
        onCodexUpdateRequired: vi.fn((listener) => {
            updateListener = listener

            return vi.fn()
        }),
        updateCodexCli: vi.fn(async () => undefined),
    }

    return {
        emitUpdateRequired: (update: { cacheVersion: string, runningVersion: string }) => updateListener?.(update),
        value,
    }
}

describe('CodexCliUpdateService', () => {
    it('does nothing in browser mode', () => {
        const dialogs = new DialogService()
        const warning = vi.spyOn(dialogs, 'warning')
        const service = new CodexCliUpdateService(() => null, dialogs)

        service.start()

        expect(warning).not.toHaveBeenCalled()
    })

    it('shows versions and updates Codex before reporting retry instructions', async () => {
        const source = bridge()
        const dialogs = new DialogService()
        const warning = vi.spyOn(dialogs, 'warning')
        const success = vi.spyOn(dialogs, 'success')
        const service = new CodexCliUpdateService(() => source.value, dialogs)
        service.start()

        source.emitUpdateRequired({ cacheVersion: '0.146.0', runningVersion: '0.144.6' })

        const options = warning.mock.calls[0][1]
        expect(warning).toHaveBeenCalledWith(
            'Codex CLI 0.144.6 is incompatible with model cache 0.146.0.',
            expect.objectContaining({ title: 'Codex update required' }),
        )
        if (!options?.action) throw new Error('Expected Codex update action')
        expect(options.action.label).toBe('Update Codex')
        await options.action.callback()
        expect(source.value.updateCodexCli).toHaveBeenCalledOnce()
        expect(success).toHaveBeenCalledWith('Codex updated successfully')
        service.stop()
    })

    it('reports update failure and leaves action callback retryable', async () => {
        const source = bridge()
        if (!source.value.updateCodexCli) throw new Error('Expected Codex update bridge')
        vi.mocked(source.value.updateCodexCli).mockRejectedValueOnce(new Error('permission denied'))
        const dialogs = new DialogService()
        const warningMessages: DialogServiceMessage[] = []
        vi.spyOn(dialogs, 'warning').mockImplementation((message, options) => {
            if (!options?.action) throw new Error('Expected Codex update action')
            const value = {
                action: options.action,
                critical: false,
                id: 1,
                message,
                severity: 'warning' as const,
                title: 'Warning',
            }
            warningMessages.push(value)

            return value
        })
        const error = vi.spyOn(dialogs, 'error')
        const service = new CodexCliUpdateService(() => source.value, dialogs)
        service.start()
        source.emitUpdateRequired({ cacheVersion: '0.146.0', runningVersion: '0.144.6' })

        await expect(warningMessages[0].action?.callback()).rejects.toThrow('permission denied')
        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Codex update failed' })

        await warningMessages[0].action?.callback()
        expect(source.value.updateCodexCli).toHaveBeenCalledTimes(2)
        service.stop()
    })
})
