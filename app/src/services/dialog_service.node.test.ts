import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage } from './dialog_service'
import { telemetryService } from './telemetry/telemetry_service'

describe('dialogService', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('emits non-critical error messages', () => {
        const listener = vi.fn()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        const error = new Error('Save failed')
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        const message = dialogService.error(error)
        const expectedDetail = expect.objectContaining({ message: 'Save failed' }) as DialogServiceMessage

        expect(message).toEqual(expect.objectContaining({
            critical: false,
            message: 'Save failed',
            severity: 'error',
            title: 'Error',
        }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expectedDetail }))
        expect(captureError).toHaveBeenCalledTimes(1)
        expect(captureError).toHaveBeenCalledWith(error)

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('forwards non-Error values unchanged while preserving fallback dialog output', () => {
        const listener = vi.fn()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        const errorValue = { cause: 'startup' }
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        const message = dialogService.error(errorValue, { critical: true, fallbackMessage: 'Startup failed', title: 'Startup blocked' })

        const expectedDetail = expect.objectContaining({
            critical: true,
            message: 'Startup failed',
            severity: 'error',
            title: 'Startup blocked',
        }) as DialogServiceMessage

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expectedDetail }))
        expect(message).toEqual(expect.objectContaining({
            critical: true,
            message: 'Startup failed',
            severity: 'error',
            title: 'Startup blocked',
        }))
        expect(captureError).toHaveBeenCalledTimes(1)
        expect(captureError).toHaveBeenCalledWith(errorValue)

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('emits warning, info, and success messages without reporting errors', () => {
        const listener = vi.fn()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        dialogService.warning('Check settings')
        dialogService.info('Sync started')
        dialogService.success('Sync finished')
        const warningDetail = expect.objectContaining({ message: 'Check settings', severity: 'warning' }) as DialogServiceMessage
        const infoDetail = expect.objectContaining({ message: 'Sync started', severity: 'info' }) as DialogServiceMessage
        const successDetail = expect.objectContaining({ message: 'Sync finished', severity: 'success' }) as DialogServiceMessage

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: warningDetail }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: infoDetail }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: successDetail }))
        expect(captureError).not.toHaveBeenCalled()

        dialogService.removeEventListener(DIALOG_SERVICE_EVENT, listener)
    })

    it('displays an error without reporting it', () => {
        const listener = vi.fn()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, listener)

        const message = dialogService.displayError('External change ignored')
        const expectedDetail = expect.objectContaining({
            message: 'External change ignored',
            severity: 'error',
        }) as DialogServiceMessage

        expect(message).toEqual(expect.objectContaining({
            message: 'External change ignored',
            severity: 'error',
            title: 'Error',
        }))
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expectedDetail }))
        expect(captureError).not.toHaveBeenCalled()

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
