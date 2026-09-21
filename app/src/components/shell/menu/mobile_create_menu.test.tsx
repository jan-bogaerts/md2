import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { MobileCreateMenu } from './mobile_create_menu'

function renderCreateMenu(overrides?: Partial<Parameters<typeof MobileCreateMenu>[0]>) {
    const props = {
        isNewActionDisabled: false,
        isNewCardDisabled: false,
        isNewDiagramDisabled: false,
        onCreateAction: vi.fn(),
        onCreateCard: vi.fn(),
        onCreateDiagram: vi.fn(),
        ...overrides,
    }

    render(
        <AppThemeProvider>
            <MobileCreateMenu {...props} />
        </AppThemeProvider>,
    )

    return props
}

describe('MobileCreateMenu', () => {
    afterEach(cleanup)

    it('renders creation actions in order and invokes their handlers', () => {
        const props = renderCreateMenu()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['New card', 'New action', 'New diagram'])
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card' }))
        expect(props.onCreateCard).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New action' }))
        expect(props.onCreateAction).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New diagram' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Sequence' }))
        expect(props.onCreateDiagram).toHaveBeenCalledWith(expect.objectContaining({ id: 'sequence', type: 'sequence' }))
    })

    it('inherits dense menu items from the app theme', () => {
        renderCreateMenu()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        screen.getAllByRole('menuitem').forEach((menuItem) => {
            expect(menuItem).toHaveClass('MuiMenuItem-dense')
        })
    })

    it.each([
        {
            disabledStates: [false, true, false],
            name: 'only New action',
            overrides: { isNewActionDisabled: true },
        },
        {
            disabledStates: [true, false, false],
            name: 'only New card',
            overrides: { isNewCardDisabled: true },
        },
        {
            disabledStates: [false, false, true],
            name: 'only New diagram',
            overrides: { isNewDiagramDisabled: true },
        },
        {
            disabledStates: [true, true, true],
            name: 'all items',
            overrides: { isNewActionDisabled: true, isNewCardDisabled: true, isNewDiagramDisabled: true },
        },
    ])('keeps menu order when $name disabled', ({ disabledStates, overrides }) => {
        renderCreateMenu(overrides)

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        const menuItems = screen.getAllByRole('menuitem')
        expect(menuItems.map((item) => item.textContent)).toEqual(['New card', 'New action', 'New diagram'])
        disabledStates.forEach((isDisabled, index) => {
            if (isDisabled) expect(menuItems[index]).toHaveAttribute('aria-disabled', 'true')
            else expect(menuItems[index]).not.toHaveAttribute('aria-disabled', 'true')
        })
    })
})
