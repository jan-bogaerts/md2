import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardPropertiesPopover } from './card_properties_popover'

describe('CardPropertiesPopover', () => {
    afterEach(cleanup)

    it('renders anchored Properties content and closes from the backdrop', () => {
        const onClose = vi.fn()
        render(
            <AppThemeProvider>
                <CardPropertiesPopover anchorElement={document.body} onClose={onClose} open>
                    <div>Properties content</div>
                </CardPropertiesPopover>
            </AppThemeProvider>,
        )

        expect(screen.getByRole('dialog', { name: 'Card properties popup' })).toHaveTextContent('Properties content')
        const backdrop = document.querySelector('.MuiBackdrop-root')
        if (!backdrop) throw new Error('Missing Properties popup backdrop')
        fireEvent.click(backdrop)

        expect(onClose).toHaveBeenCalledOnce()
    })
})
