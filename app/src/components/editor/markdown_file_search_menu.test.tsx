import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VirtuosoMockContext } from 'react-virtuoso'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFileSearchMenu } from './markdown_file_search_menu'
import { MarkdownFileSearchOption } from './markdown_file_search_option'

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
})
