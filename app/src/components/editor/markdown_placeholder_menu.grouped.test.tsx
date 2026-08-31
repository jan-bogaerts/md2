import { useTheme } from '@mui/material'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownPlaceholderMenu } from './markdown_placeholder_menu'
import { MarkdownPlaceholderOption } from './markdown_placeholder_option'
import { MarkdownTypeaheadLayerProvider } from './markdown_typeahead_layer_provider'

const STACK_POSITION = 3

function PopupLayerProbe() {
    const theme = useTheme()

    return <div data-testid="owning-popup-layer" style={{ zIndex: theme.zIndex.modal + STACK_POSITION }} />
}

describe('MarkdownPlaceholderMenu', () => {
    afterEach(cleanup)

    it('includes diagram output path insertion choice', () => {
        expect(ACTION_PROMPT_PLACEHOLDERS).toContainEqual(expect.objectContaining({ name: 'diagram-file' }))
    })

    it('renders above the owning popup stack layer and keeps option selection', () => {
        const thisCardPlaceholder = ACTION_PROMPT_PLACEHOLDERS.find(({ name }) => name === 'this-card')
        if (!thisCardPlaceholder) throw new Error('Missing this-card placeholder')
        const option = new MarkdownPlaceholderOption(thisCardPlaceholder)
        const onSelect = vi.fn()

        render(
            <AppThemeProvider>
                <MarkdownTypeaheadLayerProvider stackPosition={STACK_POSITION}>
                    <PopupLayerProbe />
                    <MarkdownPlaceholderMenu
                        onHighlight={vi.fn()}
                        onSelect={onSelect}
                        options={[option]}
                        selectedIndex={0}
                    />
                </MarkdownTypeaheadLayerProvider>
            </AppThemeProvider>,
        )

        const menuSurface = screen.getByRole('listbox', { name: 'Available placeholders' }).closest('.MuiPaper-root')
        if (!menuSurface) throw new Error('Missing placeholder menu surface')
        const popupLayer = screen.getByTestId('owning-popup-layer')

        expect(menuSurface).toHaveStyle({ position: 'relative' })
        expect(Number.parseInt(getComputedStyle(menuSurface).zIndex, 10))
            .toBe(Number.parseInt(getComputedStyle(popupLayer).zIndex, 10) + 1)

        fireEvent.click(screen.getByRole('option', { name: /this-card/u }))
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(option)
    })
})
