import { cleanup, render, screen } from '@testing-library/react'
import { useTheme } from '@mui/material'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VirtuosoMockContext } from 'react-virtuoso'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFileSearchMenu } from './markdown_file_search_menu'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownTypeaheadLayerProvider } from './markdown_typeahead_layer_provider'

const STACK_POSITION = 2

function PopupLayerProbe() {
    const theme = useTheme()

    return <div data-testid="owning-popup-layer" style={{ zIndex: theme.zIndex.modal + STACK_POSITION }} />
}

describe('MarkdownFileSearchMenu', () => {
    afterEach(cleanup)

    it('renders project files through an accessible virtualized list', () => {
        const options = [
            new MarkdownFileSearchOption('app/readme.md'),
            new MarkdownFileSearchOption('desktop/readme.md'),
        ]

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={options}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )

        expect(screen.getByRole('listbox', { name: 'Project files' })).toBeInTheDocument()
        expect(screen.getAllByRole('option')).toHaveLength(2)
        expect(screen.getByText('app/readme.md')).toBeInTheDocument()
        expect(screen.getByText('desktop/readme.md')).toBeInTheDocument()
    })

    it('renders above the owning popup stack layer', () => {
        const options = [new MarkdownFileSearchOption('app/readme.md')]

        render(
            <AppThemeProvider>
                <MarkdownTypeaheadLayerProvider stackPosition={STACK_POSITION}>
                    <PopupLayerProbe />
                    <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                        <MarkdownFileSearchMenu
                            onHighlight={vi.fn()}
                            onSelect={vi.fn()}
                            options={options}
                            selectedIndex={0}
                        />
                    </VirtuosoMockContext.Provider>
                </MarkdownTypeaheadLayerProvider>
            </AppThemeProvider>,
        )

        const menuSurface = screen.getByRole('listbox', { name: 'Project files' }).closest('.MuiPaper-root')
        if (!menuSurface) throw new Error('Missing file-search menu surface')
        const popupLayer = screen.getByTestId('owning-popup-layer')

        expect(menuSurface).toHaveStyle({ position: 'relative' })
        expect(Number.parseInt(getComputedStyle(menuSurface).zIndex, 10))
            .toBe(Number.parseInt(getComputedStyle(popupLayer).zIndex, 10) + 1)
    })
})
