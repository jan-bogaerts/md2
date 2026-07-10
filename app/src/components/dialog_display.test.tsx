import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../services/dialog_service'
import { DialogDisplay } from './dialog_display'

const SNACKBAR_TIMEOUT_PROBE_MS = 7000

describe('DialogDisplay', () => {
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('shows non-critical errors as a snackbar', async () => {
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Save failed')
        })

        const message = screen.getByRole('textbox', { name: 'Error message' })

        expect(message).toBeInTheDocument()
        expect(message).toHaveValue('Save failed')
        expect(message).toHaveAttribute('readonly')
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('keeps error snackbars open until the user closes them', async () => {
        vi.useFakeTimers()
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Save failed')
        })

        const message = screen.getByRole('textbox', { name: 'Error message' })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(SNACKBAR_TIMEOUT_PROBE_MS)
        })

        expect(message).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(screen.queryByRole('textbox', { name: 'Error message' })).toBeNull()
    })

    it('shows critical errors as a blocking dialog', async () => {
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Startup failed', { critical: true, title: 'Startup blocked' })
        })

        expect(await screen.findByRole('dialog', { name: 'Startup blocked' })).toBeInTheDocument()
        const message = screen.getByRole('textbox', { name: 'Error message' })

        expect(message).toBeInTheDocument()
        expect(message).toHaveValue('Startup failed')
        expect(message).toHaveAttribute('readonly')

        fireEvent.click(screen.getByRole('button', { name: 'OK' }))

        expect(screen.queryByRole('dialog', { name: 'Startup blocked' })).toBeNull()
    })
})
