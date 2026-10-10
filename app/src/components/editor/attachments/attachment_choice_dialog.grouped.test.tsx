import { createTheme } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { attachmentChoiceService } from '../../../services/attachments/attachment_choice_service'
import { cardPopupService } from '../../../services/card_popup_service'
import { AttachmentChoiceDialog } from './attachment_choice_dialog'

const MODAL_Z_INDEX = createTheme().zIndex.modal

afterEach(() => {
    cleanup()
    attachmentChoiceService.cancel()
    cardPopupService.clear()
    delete window.md2Files
})

/** Reads the z-index of the MUI dialog root that contains the open dialog. */
function dialogRootZIndex() {
    const dialogRoot = screen.getByRole('dialog').closest('.MuiDialog-root')
    if (!dialogRoot) throw new Error('Dialog root not found')

    return Number(getComputedStyle(dialogRoot).zIndex)
}

describe('AttachmentChoiceDialog', () => {
    it('explains both modes and disables unavailable original locations', () => {
        void attachmentChoiceService.choose([new File(['one'], 'one.pdf')])
        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        expect(screen.getByText(/saves a copy next to the card, so it stays with the project/iu)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Link without copying' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Copy into project' })).toBeEnabled()
    })

    it('applies one copy choice to all files', async () => {
        expect(cardPopupService.getSnapshot()).toHaveLength(0)
        const selection = attachmentChoiceService.choose([
            new File(['one'], 'one.pdf'),
            new File(['two'], 'two.zip'),
        ])
        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        fireEvent.click(screen.getByRole('button', { name: 'Copy into project' }))

        await expect(selection).resolves.toEqual({ choice: 'copy', originalPaths: null })
    })

    it('stacks above every open card popup', () => {
        const firstAnchor = document.createElement('button')
        const secondAnchor = document.createElement('button')
        document.body.append(firstAnchor, secondAnchor)
        cardPopupService.toggleCardDetails('card-1', firstAnchor)
        cardPopupService.toggleCardDetails('card-2', secondAnchor)
        const popupCount = cardPopupService.getSnapshot().length
        void attachmentChoiceService.choose([new File(['one'], 'one.pdf')])

        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        expect(dialogRootZIndex()).toBeGreaterThan(MODAL_Z_INDEX + popupCount)
        firstAnchor.remove()
        secondAnchor.remove()
    })

    it('raises its z-index when a popup opens while it is shown', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        void attachmentChoiceService.choose([new File(['one'], 'one.pdf')])
        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        act(() => cardPopupService.toggleCardDetails('card-1', anchorElement))

        expect(dialogRootZIndex()).toBeGreaterThan(MODAL_Z_INDEX + 1)
        anchorElement.remove()
    })
})
