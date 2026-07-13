import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../services/dialog_service'
import { globalProgressService } from '../services/global_progress_service'
import { DialogDisplay } from './dialog_display'

const SNACKBAR_TIMEOUT_PROBE_MS = 7000

describe('DialogDisplay', () => {
    afterEach(() => {
        cleanup()
        globalProgressService.finish()
        vi.useRealTimers()
    })

    it('shows non-critical errors as a snackbar', async () => {
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Save failed')
        })

        const message = screen.getByText('Save failed')

        expect(message).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('keeps error snackbars open until the user closes them', async () => {
        vi.useFakeTimers()
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Save failed')
        })

        const message = screen.getByText('Save failed')

        await act(async () => {
            await vi.advanceTimersByTimeAsync(SNACKBAR_TIMEOUT_PROBE_MS)
        })

        expect(message).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(screen.queryByText('Save failed')).toBeNull()
    })

    it('shows critical errors as a blocking dialog', async () => {
        render(<DialogDisplay />)

        act(() => {
            dialogService.error('Startup failed', { critical: true, title: 'Startup blocked' })
        })

        expect(await screen.findByRole('dialog', { name: 'Startup blocked' })).toBeInTheDocument()
        const message = screen.getByText('Startup failed')

        expect(message).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'OK' }))

        expect(screen.queryByRole('dialog', { name: 'Startup blocked' })).toBeNull()
    })

    it('shows global operation information and determinate progress in a backdrop', () => {
        render(<DialogDisplay />)

        act(() => {
            globalProgressService.start('Renaming first card', 2)
        })

        expect(screen.getByRole('status', { name: 'Updating files' })).toBeInTheDocument()
        expect(screen.getByLabelText('Working')).toBeInTheDocument()
        expect(screen.getByText('0 of 2')).toBeInTheDocument()

        act(() => {
            globalProgressService.update(1, 'Renaming second card')
        })

        expect(screen.getByText('Renaming second card')).toBeInTheDocument()
        expect(screen.getByText('1 of 2')).toBeInTheDocument()
        expect(screen.getByLabelText('File update progress')).toHaveAttribute('aria-valuenow', '50')

        act(() => {
            globalProgressService.finish()
        })

        expect(screen.queryByRole('status', { name: 'Updating files' })).toBeNull()
    })
})
