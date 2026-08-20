import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SentryImportService, SentryImportSnapshot } from '../services/sentry/sentry_import_service'
import { SentryImportConfirmationDialog } from './sentry_import_confirmation_dialog'

class ConfirmationService extends EventTarget {
    snapshot: SentryImportSnapshot = {
        confirmation: { count: 3, projectId: 'project-1' },
        isPolling: false,
        lastImportCount: null,
        lastSuccessfulPollAt: null,
        latestError: null,
    }
    cancelFirstImport = vi.fn()
    confirmFirstImport = vi.fn(async () => 3)

    getSnapshot() { return this.snapshot }
}

describe('SentryImportConfirmationDialog', () => {
    afterEach(cleanup)

    it('shows first-import count and requires explicit import approval', () => {
        const service = new ConfirmationService()
        render(<SentryImportConfirmationDialog service={service as unknown as SentryImportService} />)

        expect(screen.getByText('3 unresolved Sentry issues will be imported as bug cards.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))

        expect(service.confirmFirstImport).toHaveBeenCalledOnce()
    })

    it('cancels without importing', () => {
        const service = new ConfirmationService()
        render(<SentryImportConfirmationDialog service={service as unknown as SentryImportService} />)

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(service.cancelFirstImport).toHaveBeenCalledOnce()
        expect(service.confirmFirstImport).not.toHaveBeenCalled()
    })
})
