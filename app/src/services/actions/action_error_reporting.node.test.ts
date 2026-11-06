import { afterEach, describe, expect, it, vi } from 'vitest'
import { MISSING_THIS_CARD_CONTEXT_ERROR } from '../../../../shared/action_errors.mjs'
import { dialogService } from '../dialog_service'
import { reportActionError } from './action_error_reporting'

describe('reportActionError', () => {
    afterEach(() => vi.restoreAllMocks())

    it('displays missing this-card context without reporting it', () => {
        const displayError = vi.spyOn(dialogService, 'displayError').mockImplementation(() => ({}) as never)
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as never)
        const error = new Error('Missing card context') as Error & { code: string }
        error.code = MISSING_THIS_CARD_CONTEXT_ERROR

        reportActionError(error, { fallbackMessage: 'Action failed' })

        expect(displayError).toHaveBeenCalledWith('Missing card context', { fallbackMessage: 'Action failed' })
        expect(reportError).not.toHaveBeenCalled()
    })

    it('reports unrelated action errors', () => {
        const displayError = vi.spyOn(dialogService, 'displayError').mockImplementation(() => ({}) as never)
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as never)
        const error = new Error('Backend failed')

        reportActionError(error, { fallbackMessage: 'Action failed' })

        expect(reportError).toHaveBeenCalledWith(error, { fallbackMessage: 'Action failed' })
        expect(displayError).not.toHaveBeenCalled()
    })
})
