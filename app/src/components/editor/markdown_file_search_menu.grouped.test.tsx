import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useTheme } from '@mui/material'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VirtuosoMockContext } from 'react-virtuoso'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY, MarkdownFileSearchMenu } from './markdown_file_search_menu'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownTypeaheadLayerProvider } from './markdown_typeahead_layer_provider'

const STACK_POSITION = 2
const KEYBOARD_OPTIONS = [
    new MarkdownFileSearchOption('app/readme.md'),
    new MarkdownFileSearchOption('desktop/readme.md'),
]

/** Flushes the animation frame the menu waits for before it freezes its anchor. */
async function flushFrozenAnchor() {
    await act(async () => {
        await new Promise((resolve) => { requestAnimationFrame(() => resolve(null)) })
    })
}

function PopupLayerProbe() {
    const theme = useTheme()

    return <div data-testid="owning-popup-layer" style={{ zIndex: theme.zIndex.modal + STACK_POSITION }} />
}

function KeyboardSelectionHarness({ onSelect }: { onSelect: (option: MarkdownFileSearchOption) => void }) {
    const [open, setOpen] = useState(true)
    const [selectedIndex, setSelectedIndex] = useState(0)

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') setSelectedIndex(1)
        if (event.key === 'Enter') onSelect(KEYBOARD_OPTIONS[selectedIndex])
        if (event.key === 'Escape') setOpen(false)
    }

    return (
        <>
            <input aria-label="Markdown editor" defaultValue="@read" onKeyDown={handleKeyDown} />
            {open ? (
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={setSelectedIndex}
                        onSelect={onSelect}
                        options={KEYBOARD_OPTIONS}
                        selectedIndex={selectedIndex}
                    />
                </VirtuosoMockContext.Provider>
            ) : null}
        </>
    )
}

describe('MarkdownFileSearchMenu', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.removeItem(MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY)
    })

    it('renders project files through an accessible virtualized list', async () => {
        const options = [
            new MarkdownFileSearchOption('app/readme.md'),
            new MarkdownFileSearchOption('desktop/readme.md'),
        ]

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={options}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )

        await flushFrozenAnchor()

        expect(screen.getByRole('listbox', { name: 'Project files' })).toBeInTheDocument()
        expect(screen.getAllByRole('option')).toHaveLength(2)
        expect(screen.getByText('app/readme.md')).toBeInTheDocument()
        expect(screen.getByText('desktop/readme.md')).toBeInTheDocument()
    })

    it('renders above the owning popup stack layer', async () => {
        const options = [new MarkdownFileSearchOption('app/readme.md')]

        render(
            <AppThemeProvider>
                <MarkdownTypeaheadLayerProvider stackPosition={STACK_POSITION}>
                    <PopupLayerProbe />
                    <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                        <MarkdownFileSearchMenu
                            anchorElement={document.body}
                            onHighlight={vi.fn()}
                            onSelect={vi.fn()}
                            options={options}
                            selectedIndex={0}
                        />
                    </VirtuosoMockContext.Provider>
                </MarkdownTypeaheadLayerProvider>
            </AppThemeProvider>,
        )

        await flushFrozenAnchor()

        const menuSurface = screen.getByRole('dialog', { name: 'Project files' })
        const menuLayer = menuSurface.closest('.MuiPopper-root')
        if (!menuLayer) throw new Error('Missing file-search menu layer')
        const popupLayer = screen.getByTestId('owning-popup-layer')

        expect(menuSurface).toHaveStyle({ position: 'relative' })
        expect(Number.parseInt(getComputedStyle(menuLayer).zIndex, 10))
            .toBe(Number.parseInt(getComputedStyle(popupLayer).zIndex, 10) + 1)
    })

    it('uses a fixed size and fills the resized area without changing selection', async () => {
        const options = [
            new MarkdownFileSearchOption('app/readme.md'),
            new MarkdownFileSearchOption('desktop/readme.md'),
        ]
        const onSelect = vi.fn()

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={onSelect}
                        options={options}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()
        const dialog = screen.getByRole('dialog', { name: 'Project files' })
        const listbox = screen.getByRole('listbox', { name: 'Project files' })
        const handle = screen.getByRole('separator', { name: 'Resize file selector from bottom-right' })

        expect(dialog).toHaveStyle({ height: '320px', width: '320px' })
        expect(listbox).toHaveStyle({ flex: '1', height: '100%', minHeight: 0, width: '100%' })
        expect(screen.getAllByRole('separator', { name: /Resize file selector from/u })).toHaveLength(8)
        expect(window.localStorage.getItem(MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY)).toBeNull()

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 100, clientY: 80, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog).toHaveStyle({ height: '400px', width: '420px' })
        expect(screen.getByRole('option', { name: /readme.md app\/readme.md/u })).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByRole('option', { name: /readme.md desktop\/readme.md/u }))
        expect(onSelect).toHaveBeenCalledWith(options[1])
        expect(JSON.parse(window.localStorage.getItem(MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY) ?? '{}'))
            .toEqual({ height: 400, width: 420 })
    })

    it('restores file-selector size from its app-wide storage key', async () => {
        window.localStorage.setItem(MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY, JSON.stringify({ height: 240, width: 500 }))

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={[new MarkdownFileSearchOption('app/readme.md')]}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )

        await flushFrozenAnchor()

        expect(screen.getByRole('dialog', { name: 'Project files' })).toHaveStyle({ height: '240px', width: '500px' })
    })

    it('keeps one size while the number of matching files changes', async () => {
        const { rerender } = render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={[new MarkdownFileSearchOption('app/readme.md')]}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()
        const dialog = screen.getByRole('dialog', { name: 'Project files' })

        expect(dialog).toHaveStyle({ height: '320px', width: '320px' })

        rerender(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={[
                            new MarkdownFileSearchOption('app/readme.md'),
                            new MarkdownFileSearchOption('desktop/readme.md'),
                            new MarkdownFileSearchOption('design/F_108.md'),
                        ]}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )

        expect(screen.getByRole('dialog', { name: 'Project files' })).toBe(dialog)
        expect(dialog).toHaveStyle({ height: '320px', width: '320px' })
    })

    it('stays open with a message when no file matches the query', async () => {
        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={document.body}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={[]}
                        selectedIndex={null}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()

        expect(screen.getByRole('dialog', { name: 'Project files' })).toHaveStyle({ height: '320px', width: '320px' })
        expect(screen.getByText('No matching files')).toBeInTheDocument()
        expect(screen.queryByRole('listbox', { name: 'Project files' })).not.toBeInTheDocument()
    })

    it('freezes its anchor so later moves of the lexical anchor leave the popup in place', async () => {
        const overlayContainer = document.createElement('div')
        const lexicalAnchor = document.createElement('div')
        lexicalAnchor.style.position = 'absolute'
        lexicalAnchor.style.left = '120px'
        lexicalAnchor.style.top = '240px'
        lexicalAnchor.style.height = '18px'
        overlayContainer.append(lexicalAnchor)
        document.body.append(overlayContainer)

        render(
            <AppThemeProvider>
                <VirtuosoMockContext.Provider value={{ itemHeight: 52, viewportHeight: 104 }}>
                    <MarkdownFileSearchMenu
                        anchorElement={lexicalAnchor}
                        onHighlight={vi.fn()}
                        onSelect={vi.fn()}
                        options={[new MarkdownFileSearchOption('app/readme.md')]}
                        selectedIndex={0}
                    />
                </VirtuosoMockContext.Provider>
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()
        const frozenAnchor = overlayContainer.querySelector<HTMLElement>('[data-markdown-file-search-anchor]')
        if (!frozenAnchor) throw new Error('Missing frozen file-search anchor')

        expect(frozenAnchor.style.left).toBe('120px')
        expect(frozenAnchor.style.top).toBe('240px')
        expect(frozenAnchor.style.height).toBe('18px')

        lexicalAnchor.style.left = '400px'
        lexicalAnchor.style.top = '600px'
        lexicalAnchor.style.height = '90px'
        await flushFrozenAnchor()

        expect(frozenAnchor.style.left).toBe('120px')
        expect(frozenAnchor.style.top).toBe('240px')
        expect(frozenAnchor.style.height).toBe('18px')
        overlayContainer.remove()
    })

    it('leaves focus and keyboard selection with the editor after resize', async () => {
        const onSelect = vi.fn()
        render(
            <AppThemeProvider>
                <KeyboardSelectionHarness onSelect={onSelect} />
            </AppThemeProvider>,
        )
        await flushFrozenAnchor()
        const editor = screen.getByRole('textbox', { name: 'Markdown editor' }) as HTMLInputElement
        editor.focus()
        editor.setSelectionRange(1, 5)

        fireEvent.pointerDown(
            screen.getByRole('separator', { name: 'Resize file selector from right' }),
            { clientX: 0, clientY: 0, pointerId: 1 },
        )
        fireEvent.pointerMove(window, { clientX: 80, clientY: 0, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(editor).toHaveFocus()
        expect(editor).toHaveValue('@read')
        expect(editor.selectionStart).toBe(1)
        expect(editor.selectionEnd).toBe(5)

        fireEvent.keyDown(editor, { key: 'ArrowDown' })
        fireEvent.keyDown(editor, { key: 'Enter' })

        expect(onSelect).toHaveBeenCalledWith(KEYBOARD_OPTIONS[1])
        fireEvent.keyDown(editor, { key: 'Escape' })
        expect(screen.queryByRole('listbox', { name: 'Project files' })).not.toBeInTheDocument()
    })
})
