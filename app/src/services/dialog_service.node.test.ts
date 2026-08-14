import { describe, expect, it, vi } from 'vitest'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage } from './dialog_service'

describe('dialogService', () => {
    it('emits non-critical error messages', () => {
        const listener = vi.fn()
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        const message = dialogService.error(new Error('Save failed'))
        const expectedDetail = expect.objectContaining({ message: 'Save failed' }) as DialogServiceMessage

        expect(message).toEqual(expect.objectContaining({
            critical: false,
            message: 'Save failed',
            severity: 'error',
            title: 'Error',
        }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expectedDetail }))

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('supports critical fallback messages and custom titles', () => {
        const listener = vi.fn()
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        dialogService.error(null, { critical: true, fallbackMessage: 'Startup failed', title: 'Startup blocked' })

        const expectedDetail = expect.objectContaining({
            critical: true,
            message: 'Startup failed',
            severity: 'error',
            title: 'Startup blocked',
        }) as DialogServiceMessage

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expectedDetail }))

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('emits warning and info message types', () => {
        const listener = vi.fn()
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        dialogService.warning('Check settings')
        dialogService.info('Sync started')
        const warningDetail = expect.objectContaining({ message: 'Check settings', severity: 'warning' }) as DialogServiceMessage
        const infoDetail = expect.objectContaining({ message: 'Sync started', severity: 'info' }) as DialogServiceMessage

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: warningDetail }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: infoDetail }))

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('includes optional snackbar action without changing text-only messages', () => {
        const callback = vi.fn()
        const actionable = dialogService.warning('Codex update required', {action: { callback, label: 'Update Codex' }})
        const textOnly = dialogService.info('Sync started')

        expect(actionable.action).toEqual({ callback, label: 'Update Codex' })
        expect(textOnly.action).toBeUndefined()
    })
})
