import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchOptionItem } from './markdown_file_search_option_item'

describe('MarkdownFileSearchOptionItem', () => {
    afterEach(cleanup)

    it('shows filename and repository path so duplicate filenames remain distinguishable', () => {
        const option = new MarkdownFileSearchOption('design/features/readme.md')

        render(
            <AppThemeProvider>
                <MarkdownFileSearchOptionItem
                    index={0}
                    onHighlight={vi.fn()}
                    onSelect={vi.fn()}
                    selected={false}
                    selectionOption={option}
                    setRefElement={vi.fn()}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText('readme.md')).toBeInTheDocument()
        expect(screen.getByText('design/features/readme.md')).toBeInTheDocument()
    })

    it('selects on click without allowing mouse-down to move editor focus', () => {
        const option = new MarkdownFileSearchOption('design/F_108.md')
        const onHighlight = vi.fn()
        const onSelect = vi.fn()

        render(
            <AppThemeProvider>
                <MarkdownFileSearchOptionItem
                    index={2}
                    onHighlight={onHighlight}
                    onSelect={onSelect}
                    selected
                    selectionOption={option}
                    setRefElement={vi.fn()}
                />
            </AppThemeProvider>,
        )
        const item = screen.getByRole('option')

        expect(fireEvent.mouseDown(item)).toBe(false)
        fireEvent.mouseEnter(item)
        fireEvent.click(item)

        expect(onHighlight).toHaveBeenCalledExactlyOnceWith(2)
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(option)
    })
})
