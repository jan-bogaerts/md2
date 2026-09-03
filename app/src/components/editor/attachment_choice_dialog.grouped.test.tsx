import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { attachmentChoiceService } from '../../services/attachments/attachment_choice_service'
import { AttachmentChoiceDialog } from './attachment_choice_dialog'

afterEach(() => {
    cleanup()
    attachmentChoiceService.cancel()
    delete window.md2Files
})

describe('AttachmentChoiceDialog', () => {
    it('explains both modes and disables unavailable original locations', () => {
        void attachmentChoiceService.choose([new File(['one'], 'one.pdf')])
        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        expect(screen.getByText(/saves a copy next to the card, so it stays with the project/iu)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Link without copying' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Copy into project' })).toBeEnabled()
    })

    it('applies one copy choice to all files', async () => {
        const selection = attachmentChoiceService.choose([
            new File(['one'], 'one.pdf'),
            new File(['two'], 'two.zip'),
        ])
        render(<AppThemeProvider><AttachmentChoiceDialog /></AppThemeProvider>)

        fireEvent.click(screen.getByRole('button', { name: 'Copy into project' }))

        await expect(selection).resolves.toEqual({ choice: 'copy', originalPaths: null })
    })
})
