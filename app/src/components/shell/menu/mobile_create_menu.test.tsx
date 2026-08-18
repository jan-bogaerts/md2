import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { MobileCreateMenu } from './mobile_create_menu'

function renderCreateMenu(overrides?: Partial<Parameters<typeof MobileCreateMenu>[0]>) {
    const props = {
        isNewActionDisabled: false,
        isNewCardDisabled: false,
        onCreateAction: vi.fn(),
        onCreateCard: vi.fn(),
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

    it('renders card before action and invokes both handlers', () => {
        const props = renderCreateMenu()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['New card', 'New action'])
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card' }))
        expect(props.onCreateCard).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New action' }))
        expect(props.onCreateAction).toHaveBeenCalledOnce()
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
            disabledStates: [false, true],
            name: 'only New action',
            overrides: { isNewActionDisabled: true },
        },
        {
            disabledStates: [true, false],
            name: 'only New card',
            overrides: { isNewCardDisabled: true },
        },
        {
            disabledStates: [true, true],
            name: 'both items',
            overrides: { isNewActionDisabled: true, isNewCardDisabled: true },
        },
    ])('keeps menu order when $name disabled', ({ disabledStates, overrides }) => {
        renderCreateMenu(overrides)

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        const menuItems = screen.getAllByRole('menuitem')
        expect(menuItems.map((item) => item.textContent)).toEqual(['New card', 'New action'])
        disabledStates.forEach((isDisabled, index) => {
            if (isDisabled) expect(menuItems[index]).toHaveAttribute('aria-disabled', 'true')
            else expect(menuItems[index]).not.toHaveAttribute('aria-disabled', 'true')
        })
    })
})
