import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardDeleteDialog } from './card_delete_dialog'

const CARD_PATH = 'design/F-1.md'

interface DeleteDialogHarnessProps {
    onDeleteCard: (path: string) => Promise<void>
}

function DeleteDialogHarness(props: DeleteDialogHarnessProps) {
    const { onDeleteCard } = props
    const [cardPath, setCardPath] = useState<string | null>(null)
    const openDialog = () => setCardPath(CARD_PATH)
    const closeDialog = () => setCardPath(null)

    return (
        <>
            <button onClick={openDialog} type="button">Open delete</button>
            <CardDeleteDialog cardPath={cardPath} onClose={closeDialog} onDeleteCard={onDeleteCard} />
        </>
    )
}

async function openDeleteDialog() {
    const opener = screen.getByRole('button', { name: 'Open delete' })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByRole('dialog')

    return opener
}

describe('CardDeleteDialog', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('restores focus to the opener and does not delete when cancelled', async () => {
        const onDeleteCard = vi.fn(async () => undefined)
        render(<DeleteDialogHarness onDeleteCard={onDeleteCard} />)
        const opener = await openDeleteDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(opener).toHaveFocus())
        expect(onDeleteCard).not.toHaveBeenCalled()
    })

    it('does not restore focus to the opener after deleting', async () => {
        const onDeleteCard = vi.fn(async () => undefined)
        render(<DeleteDialogHarness onDeleteCard={onDeleteCard} />)
        const opener = await openDeleteDialog()
        const focusSpy = vi.spyOn(opener, 'focus')

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        })

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(onDeleteCard).toHaveBeenCalledWith(CARD_PATH)
        expect(focusSpy).not.toHaveBeenCalled()
        expect(opener).not.toHaveFocus()
    })
})
