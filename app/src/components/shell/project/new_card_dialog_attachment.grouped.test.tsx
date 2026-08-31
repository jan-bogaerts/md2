import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types'
import { attachmentChoiceService } from '../../../services/attachments/attachment_choice_service'
import { projectSessionService } from '../../../services/project/project_session_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { AttachmentChoiceDialog } from '../../editor/attachment_choice_dialog'
import { NewCardDialog } from './new_card_dialog'

function NewCardAttachmentTestSurface() {
    const [open, setOpen] = useState(true)
    const openDialog = () => setOpen(true)
    const closeDialog = () => setOpen(false)

    return (
        <AppThemeProvider>
            <button onClick={openDialog} type="button">Open new card</button>
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
            <AttachmentChoiceDialog />
        </AppThemeProvider>
    )
}

describe('NewCardDialog attachment regression', () => {
    afterEach(() => {
        cleanup()
        attachmentChoiceService.cancel()
        projectSessionService.newCardMarkdownDraft.replace('')
        vi.restoreAllMocks()
    })

    it('inserts into an untouched editor, then reopens with editable cleared inputs', async () => {
        const user = userEvent.setup()
        const file = new File(['report'], 'report.pdf', { type: 'application/pdf' })
        vi.spyOn(projectSessionService, 'copyNewCardAttachments').mockResolvedValue([
            { fileName: 'report.pdf', path: 'design/report.pdf' },
        ])
        const discardAttachments = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue()
        vi.spyOn(projectSessionService, 'hasNewCardDraftImages').mockReturnValue(true)
        render(<NewCardAttachmentTestSurface />)

        const initialDialog = screen.getByRole('dialog', { name: 'New card' })
        const fileInput = initialDialog.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(fileInput, { target: { files: [file] } })
        fireEvent.click(await screen.findByRole('button', { name: 'Copy into project' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Attach/ })).not.toBeInTheDocument())
        const firstDialog = screen.getByRole('dialog', { name: 'New card' })
        const firstDescription = within(within(firstDialog).getByRole('group', { name: 'Description' })).getByRole('textbox')
        await waitFor(() => expect(firstDescription).toHaveValue('[report.pdf](<report.pdf>)'))
        expect(projectSessionService.newCardMarkdownDraft.getSnapshot()).toBe('[report.pdf](<report.pdf>)')
        expect(attachmentChoiceService.getSnapshot()).toBeNull()

        fireEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
        await user.click(screen.getByRole('button', { name: 'Discard' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument())
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this new card draft?' })).not.toBeInTheDocument())
        expect(discardAttachments).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Open new card' }))
        const reopenedDialog = await screen.findByRole('dialog', { name: 'New card' })
        const title = within(reopenedDialog).getByRole('textbox', { name: 'Title' })
        const description = within(within(reopenedDialog).getByRole('group', { name: 'Description' })).getByRole('textbox')
        expect(description).toHaveValue('')

        await user.click(title)
        await user.type(title, 'Next card')
        await user.click(description)
        await user.type(description, 'Editable body')

        expect(title).toHaveValue('Next card')
        expect(description).toHaveValue('Editable body')
        expect(projectSessionService.newCardMarkdownDraft.getSnapshot()).toBe('Editable body')
        expect(attachmentChoiceService.getSnapshot()).toBeNull()
    })
})
