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

    it('exposes both creation actions and invokes their handlers', () => {
        const props = renderCreateMenu()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New action' }))
        expect(props.onCreateAction).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card' }))
        expect(props.onCreateCard).toHaveBeenCalledOnce()
    })

    it('keeps each action disabled independently', () => {
        renderCreateMenu({ isNewActionDisabled: true })

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        expect(screen.getByRole('menuitem', { name: 'New action' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'New card' })).not.toHaveAttribute('aria-disabled', 'true')
    })
})
