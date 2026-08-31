import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuItem } from '@mui/material'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { BranchMenuSelect } from './branch_menu_select'
import { MenuSelect } from './menu_select'

function hoverSelect(label: string) {
    fireEvent.mouseOver(screen.getByRole('combobox', { name: label }))
}

function openSelect(label: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: label }))
}

describe('toolbar menu selects', () => {
    afterEach(cleanup)

    it('hides the default agent tooltip while its select menu is open', async () => {
        render(
            <AppThemeProvider>
                <MenuSelect label="Default agent" onChange={vi.fn()} value="codex">
                    <MenuItem value="codex">codex</MenuItem>
                </MenuSelect>
            </AppThemeProvider>,
        )

        hoverSelect('Default agent')
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Default agent')

        openSelect('Default agent')

        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
        expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('hides the switch branch tooltip while its select menu is open', async () => {
        const onOpen = vi.fn()
        render(
            <AppThemeProvider>
                <BranchMenuSelect
                    branches={[{ name: 'main' }]}
                    disabled={false}
                    onChange={vi.fn()}
                    onOpen={onOpen}
                    value="main"
                />
            </AppThemeProvider>,
        )

        hoverSelect('Switch branch')
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Switch branch')

        openSelect('Switch branch')

        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
        expect(screen.getByRole('listbox')).toBeInTheDocument()
        expect(onOpen).toHaveBeenCalledOnce()
    })
})
