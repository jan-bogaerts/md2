import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import type { MutableRefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VirtuosoMockContext } from 'react-virtuoso'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { renderFileSearchMenu } from './markdown_file_search_menu_renderer'

type MenuItemProps = Parameters<typeof renderFileSearchMenu>[1]

function menuItemProps(options: MarkdownFileSearchOption[]): MenuItemProps {
    return {
        options,
        selectedIndex: options.length === 0 ? null : 0,
        selectOptionAndCleanUp: vi.fn(),
        setHighlightedIndex: vi.fn(),
    }
}

async function flushFrozenAnchor() {
    await act(async () => {
        await new Promise((resolve) => { requestAnimationFrame(() => resolve(null)) })
    })
}

describe('renderFileSearchMenu', () => {
    afterEach(cleanup)

    it('renders no menu while the lexical anchor is missing', () => {
        expect(renderFileSearchMenu(createRef<HTMLElement>(), menuItemProps([]), '')).toBeNull()
    })

    it('keeps rendering the menu when no file matches the query', async () => {
        const anchorElement = document.createElement('div')
        document.body.append(anchorElement)
        const anchorElementRef = { current: anchorElement } as MutableRefObject<HTMLElement | null>

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    {renderFileSearchMenu(anchorElementRef, menuItemProps([]), '')}
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()

        expect(screen.getByRole('dialog', { name: 'Project files' })).toBeInTheDocument()
        expect(screen.getByText('No matching files')).toBeInTheDocument()
        anchorElement.remove()
    })
})
