import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types'
import { projectSessionService } from '../../../services/project/project_session_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardDialog } from './new_card_dialog'

const originalMatchMedia = window.matchMedia

function useFullScreenPhoneBrowser() {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: true,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
    // A real browser answers history.go with a popstate event, and the dismissal service relies on
    // seeing that event to recognise its own history move; the stub has to do the same.
    vi.spyOn(window.history, 'go').mockImplementation(() => {
        queueMicrotask(() => window.dispatchEvent(new PopStateEvent('popstate')))
    })
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
}

function NewCardBackDismissTestSurface({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true)
    const closeDialog = () => {
        setOpen(false)
        onClose()
    }

    return (
        <AppThemeProvider>
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={closeDialog}
                onCreateCard={vi.fn(async () => undefined)}
                open={open}
                states={DEFAULT_STATES}
            />
        </AppThemeProvider>
    )
}

async function pressBack() {
    await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'))
        await Promise.resolve()
    })
}

describe('NewCardDialog back-button dismissal', () => {
    afterEach(async () => {
        cleanup()
        await act(async () => {
            await Promise.resolve()
        })
        window.matchMedia = originalMatchMedia
        projectSessionService.newCardMarkdownDraft.replace('')
        vi.restoreAllMocks()
    })

    it('closes the full-screen dialog on back when the draft is clean', async () => {
        useFullScreenPhoneBrowser()
        vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue()
        const onClose = vi.fn()
        render(<NewCardBackDismissTestSurface onClose={onClose} />)
        expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument()

        await pressBack()

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument())
    })

    it('asks to discard a dirty draft on back and keeps the dialog open while asking', async () => {
        useFullScreenPhoneBrowser()
        vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue()
        const onClose = vi.fn()
        render(<NewCardBackDismissTestSurface onClose={onClose} />)
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Draft title' } })

        await pressBack()

        expect(await screen.findByText('Discard this new card draft?')).toBeInTheDocument()
        expect(screen.getByTestId('new-card-dialog-content')).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()

        await pressBack()

        expect(screen.getByText('Discard this new card draft?')).toBeInTheDocument()
        expect(screen.getByTestId('new-card-dialog-content')).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))

        await waitFor(() => expect(screen.queryByText('Discard this new card draft?')).not.toBeInTheDocument())
        expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('claims no history entry on a wide screen', () => {
        vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
        render(<NewCardBackDismissTestSurface onClose={vi.fn()} />)

        expect(window.history.pushState).not.toHaveBeenCalled()
    })
})
