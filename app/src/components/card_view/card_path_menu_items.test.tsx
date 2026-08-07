import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuList } from '@mui/material'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../../services/dialog_service'
import { CardPathMenuItems } from './card_path_menu_items'

function renderMenuItems(props: Parameters<typeof CardPathMenuItems>[0]) {
    render(<MenuList><CardPathMenuItems {...props} /></MenuList>)
}

describe('CardPathMenuItems', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('copies Windows absolute and unchanged relative card paths', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        const onSelected = vi.fn()
        Object.assign(navigator, { clipboard: { writeText } })
        renderMenuItems({ cardPath: 'design/F_116.md', onSelected, rootPath: 'C:\\repo\\' })

        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
        expect(writeText).toHaveBeenNthCalledWith(1, 'C:\\repo\\design\\F_116.md')
        expect(writeText).toHaveBeenNthCalledWith(2, 'design/F_116.md')
        expect(onSelected).toHaveBeenCalledTimes(2)
    })

    it('uses slash separators for slash-based local roots', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        renderMenuItems({ cardPath: 'design/F_116.md', onSelected: vi.fn(), rootPath: '/repo/' })

        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('/repo/design/F_116.md'))
    })

    it('offers only unchanged relative path without a local root', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        renderMenuItems({ cardPath: 'design/F_116.md', onSelected: vi.fn() })

        expect(screen.queryByRole('menuitem', { name: 'Copy path' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('design/F_116.md'))
    })

    it('closes before writing and reports clipboard failure', async () => {
        const copyError = new Error('Clipboard denied')
        const writeText = vi.fn().mockRejectedValue(copyError)
        const onSelected = vi.fn()
        const reportError = vi.spyOn(dialogService, 'error')
        Object.assign(navigator, { clipboard: { writeText } })
        renderMenuItems({ cardPath: 'design/F_116.md', onSelected, rootPath: 'C:\\repo' })

        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))

        expect(onSelected).toHaveBeenCalledOnce()
        expect(writeText).toHaveBeenCalledAfter(onSelected)
        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            copyError,
            { fallbackMessage: 'Path could not be copied to clipboard' },
        ))
    })
})
