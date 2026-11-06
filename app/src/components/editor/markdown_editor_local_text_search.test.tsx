import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UNDO_COMMAND } from 'lexical'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keyboardShortcutService } from '../../services/shortcuts/keyboard_shortcut_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { testLexicalEditor } from '../../test/lexical_composer_context_stub'
import type { CardOpenDocument } from '../../services/open_files_service'
import { MarkdownEditor } from './markdown_editor'
import { MarkdownDocumentHistoryStore } from './history/markdown_document_history_store'
import {
    MarkdownDataSourceBase,
    type MarkdownDataSource,
    type MarkdownDocumentTarget,
} from './data_sources/markdown_data_source'

type CapturedPopperProps = ComponentProps<(typeof import('@mui/material'))['Popper']>

const popperPropsSpy = vi.hoisted(() => vi.fn<(props: CapturedPopperProps) => void>())

vi.mock('@mui/material', async (importOriginal) => {
    const material = await importOriginal<typeof import('@mui/material')>()
    const MaterialPopper = material.Popper

    return {
        ...material,
        Popper: (props: ComponentProps<typeof MaterialPopper>) => {
            popperPropsSpy(props)
            return <MaterialPopper {...props} />
        },
    }
})

class SearchTestDataSource extends MarkdownDataSourceBase {
    readonly commit = vi.fn<MarkdownDataSource['commit']>(() => true)
    readonly edit = vi.fn()
    private readonly markdown: string
    private readonly target: MarkdownDocumentTarget

    constructor(markdown: string) {
        super()
        this.markdown = markdown
        const document = Object.assign(new EventTarget(), { kind: 'card' as const }) as CardOpenDocument
        this.target = { document }
        this.setActiveTarget('list-card', this.target)
    }

    getMarkdown(target: MarkdownDocumentTarget) {
        if (target !== this.target) throw new Error('Unknown search test document')
        return this.markdown
    }
}

interface SearchEditorOverrides {
    hideToolbar?: boolean
    localTextSearch?: boolean
    overlayContainer?: HTMLElement | null
    readOnly?: boolean
}

function renderSearchEditor(
    markdown: string,
    props: SearchEditorOverrides = {},
) {
    const onChange = vi.fn()
    const onDirtyChange = vi.fn()
    const view = render(
        <AppThemeProvider>
            <MarkdownEditor
                markdown={markdown}
                onChange={onChange}
                onDirtyChange={onDirtyChange}
                {...props}
            />
        </AppThemeProvider>,
    )

    return { onChange, onDirtyChange, ...view }
}

function selectText(textbox: HTMLTextAreaElement, start: number, end = start) {
    textbox.setSelectionRange(start, end)
    fireEvent.select(textbox)
}

async function submitReplaceSearch(editor: HTMLElement, term: string, replacement: string) {
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' })
    const searchField = screen.getByRole('textbox', { name: 'Find text' })
    fireEvent.change(searchField, { target: { value: term } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), { target: { value: replacement } })
    fireEvent.keyDown(searchField, { key: 'Enter' })
    await screen.findByText(/results?$/)
}

function capturedSearchPopperProps() {
    const calls = popperPropsSpy.mock.calls.filter(([props]) => props.role === 'dialog')
    const call = calls[calls.length - 1]
    if (!call) throw new Error('Expected local-search Popper props')

    return call[0]
}

// Keep this module isolated: its MUI Popper mock must be installed before MarkdownEditor is imported.
describe('MarkdownEditor local text search', () => {
    beforeEach(() => keyboardShortcutService.start())
    afterEach(() => {
        cleanup()
        keyboardShortcutService.stop()
    })

    it('opens from the shared toolbar search button', () => {
        renderSearchEditor('Find this')

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))

        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveFocus()
    })

    it('anchors below the visible formatting toolbar', () => {
        const { container } = renderSearchEditor('Find this')
        const toolbar = container.querySelector<HTMLElement>('.mdxeditor-toolbar')
        if (!toolbar) throw new Error('Expected visible Markdown toolbar')
        const editor = screen.getByRole('textbox')

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))

        const popperProps = capturedSearchPopperProps()
        expect(popperProps.anchorEl).toBe(toolbar)
        expect(popperProps.anchorEl).not.toBe(editor)
        expect(popperProps.placement).toBe('bottom-end')
    })

    it('opens with Ctrl+F without a toolbar and prevents browser find', () => {
        renderSearchEditor('before **Bold** after', { hideToolbar: true })
        const editor = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(editor, 9, 13)

        const browserEventAllowed = fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        expect(browserEventAllowed).toBe(false)
        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveValue('Bold')
        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveFocus()
    })

    it('anchors above the editor root when the toolbar is hidden', () => {
        renderSearchEditor('Find this', { hideToolbar: true })
        const editor = screen.getByRole('textbox')

        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        const popperProps = capturedSearchPopperProps()
        expect(popperProps.anchorEl).toBe(editor)
        expect(popperProps.placement).toBe('top-end')
    })

    it('keeps typed search text as a focused draft until Enter submits it', async () => {
        renderSearchEditor('Alpha beta ALPHA')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 6)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })

        fireEvent.change(searchField, { target: { value: 'Alpha' } })

        expect(searchField).toHaveValue('Alpha')
        expect(searchField).toHaveFocus()
        expect(editor.selectionStart).toBe(6)
        expect(editor.selectionEnd).toBe(6)
        expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()

        fireEvent.keyDown(searchField, { key: 'Enter' })

        await waitFor(() => expect(editor.selectionStart).toBe(11))
        expect(editor.selectionEnd).toBe(16)
        expect(screen.getByText('2 results')).toBeInTheDocument()
    })

    describe('automatic search debounce', () => {
        beforeEach(() => vi.useFakeTimers())
        afterEach(() => vi.useRealTimers())

        it('restarts the delay and searches only after 800 ms without another change', () => {
            renderSearchEditor('Alpha beta')
            const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
            fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
            const searchField = screen.getByRole('textbox', { name: 'Find text' })

            fireEvent.change(searchField, { target: { value: 'Alpha' } })
            act(() => vi.advanceTimersByTime(799))
            expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()

            fireEvent.change(searchField, { target: { value: 'beta' } })
            act(() => vi.advanceTimersByTime(799))
            expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()

            act(() => vi.advanceTimersByTime(1))
            expect(screen.getByText('1 result')).toBeInTheDocument()
            expect(editor.selectionStart).toBe(6)
            expect(editor.selectionEnd).toBe(10)
        })

        it('submits immediately on Enter and cancels the delayed duplicate', () => {
            renderSearchEditor('one two one')
            const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
            fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
            const searchField = screen.getByRole('textbox', { name: 'Find text' })
            fireEvent.change(searchField, { target: { value: 'one' } })

            fireEvent.keyDown(searchField, { key: 'Enter' })
            expect(editor.selectionStart).toBe(0)
            selectText(editor, 4)
            act(() => vi.advanceTimersByTime(800))

            expect(editor.selectionStart).toBe(4)
            expect(editor.selectionEnd).toBe(4)
        })

        it('clears completed state immediately and cancels pending work', () => {
            renderSearchEditor('Alpha beta')
            const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
            fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
            const searchField = screen.getByRole('textbox', { name: 'Find text' })
            fireEvent.change(searchField, { target: { value: 'Alpha' } })
            act(() => vi.advanceTimersByTime(800))
            expect(screen.getByText('1 result')).toBeInTheDocument()

            fireEvent.change(searchField, { target: { value: 'beta' } })
            fireEvent.change(searchField, { target: { value: '' } })

            expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Next result' })).toBeDisabled()
            act(() => vi.advanceTimersByTime(800))
            expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()
        })

        it('cancels pending work when search closes', () => {
            renderSearchEditor('Alpha')
            const editor = screen.getAllByRole('textbox')[0]
            fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
            fireEvent.change(screen.getByRole('textbox', { name: 'Find text' }), { target: { value: 'Alpha' } })

            fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
            act(() => vi.advanceTimersByTime(800))
            fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

            expect(screen.queryByText(/results?$/)).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Next result' })).toBeDisabled()
        })
    })

    it('submits search from the accessible popup button', async () => {
        renderSearchEditor('before target')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'target' } })
        const searchButton = screen.getByRole('button', { name: 'Search' })

        fireEvent.mouseOver(searchButton)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Search')
        fireEvent.click(searchButton)

        await waitFor(() => expect(editor.selectionStart).toBe(7))
        expect(editor.selectionEnd).toBe(13)
    })

    it('reruns the non-empty draft immediately when match case changes', () => {
        renderSearchEditor('Alpha ALPHA')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 0)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'ALPHA' } })
        const matchCase = screen.getByRole('button', { name: 'Match case' })

        expect(matchCase).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(matchCase)

        expect(editor.selectionStart).toBe(6)
        expect(editor.selectionEnd).toBe(11)
        expect(screen.getByText('1 result')).toBeInTheDocument()
        expect(matchCase).toHaveAttribute('aria-pressed', 'true')
    })

    it('leaves editor selection unchanged when an empty term is submitted', () => {
        renderSearchEditor('unchanged')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 3)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })

        fireEvent.keyDown(searchField, { key: 'Enter' })
        fireEvent.click(screen.getByRole('button', { name: 'Search' }))

        expect(editor.selectionStart).toBe(3)
        expect(editor.selectionEnd).toBe(3)
    })

    it('uses the latest search completed by a case change for F3', async () => {
        renderSearchEditor('Alpha alpha Alpha')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'Alpha' } })
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
        fireEvent.keyDown(searchField, { key: 'Enter' })
        await waitFor(() => expect(editor.selectionEnd).toBe(5))

        fireEvent.change(searchField, { target: { value: 'alpha' } })
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
        expect(screen.getByText('3 results')).toBeInTheDocument()
        fireEvent.keyDown(searchField, { key: 'F3' })

        await waitFor(() => expect(editor.selectionStart).toBe(6))
        expect(editor.selectionEnd).toBe(11)

        fireEvent.keyDown(searchField, { key: 'F3' })

        await waitFor(() => expect(editor.selectionStart).toBe(12))
    })

    it('navigates both directions with accessible arrow buttons and wraps', async () => {
        renderSearchEditor('one two one')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'one' } })
        fireEvent.keyDown(searchField, { key: 'Enter' })
        await waitFor(() => expect(editor.selectionEnd).toBe(3))

        const previousButton = screen.getByRole('button', { name: 'Previous result' })
        const nextButton = screen.getByRole('button', { name: 'Next result' })
        fireEvent.mouseOver(previousButton)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Previous result')

        fireEvent.click(nextButton)
        await waitFor(() => expect(editor.selectionStart).toBe(8))
        fireEvent.click(nextButton)
        await waitFor(() => expect(editor.selectionStart).toBe(0))
        fireEvent.click(previousButton)
        await waitFor(() => expect(editor.selectionStart).toBe(8))
    })

    it('shows zero results without moving selection and singular count for one match', async () => {
        renderSearchEditor('one two')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 4)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'missing' } })
        fireEvent.keyDown(searchField, { key: 'Enter' })

        expect(await screen.findByText('0 results')).toBeInTheDocument()
        expect(editor.selectionStart).toBe(4)
        expect(editor.selectionEnd).toBe(4)

        fireEvent.change(searchField, { target: { value: 'two' } })
        fireEvent.keyDown(searchField, { key: 'Enter' })

        expect(await screen.findByText('1 result')).toBeInTheDocument()
    })

    it('leaves editor selection unchanged when F3 has no valid submission', () => {
        renderSearchEditor('one two one')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 4)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'one' } })

        fireEvent.keyDown(searchField, { key: 'F3' })

        expect(editor.selectionStart).toBe(4)
        expect(editor.selectionEnd).toBe(4)
    })

    it('leaves selection and editor state unchanged for a missing term', async () => {
        const { onChange, onDirtyChange } = renderSearchEditor('unchanged')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 3)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'missing' } })
        fireEvent.keyDown(searchField, { key: 'Enter' })

        await waitFor(() => expect(editor.selectionStart).toBe(3))
        expect(editor).toHaveValue('unchanged')
        expect(onChange).not.toHaveBeenCalled()
        expect(onDirtyChange).not.toHaveBeenCalledWith(true)
    })

    it('does not edit, persist, or add document history while selecting matches', async () => {
        const dataSource = new SearchTestDataSource('one two one')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={historyStore}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'one' } })
        fireEvent.keyDown(searchField, { key: 'Enter' })
        await waitFor(() => expect(editor.selectionEnd).toBe(3))

        expect(dataSource.edit).not.toHaveBeenCalled()
        expect(dataSource.commit).not.toHaveBeenCalled()
        expect(historyStore.canUndo).toBe(false)
        expect(historyStore.canRedo).toBe(false)
    })

    it('works in a read-only hidden-toolbar editor and closes with Escape', () => {
        renderSearchEditor('locked text', { hideToolbar: true, readOnly: true })
        const editor = screen.getByRole('textbox')

        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.keyDown(searchField, { key: 'Escape' })

        expect(screen.queryByRole('textbox', { name: 'Find text' })).not.toBeInTheDocument()
        expect(editor).toHaveValue('locked text')
    })

    it('closes from the popup close button', () => {
        renderSearchEditor('Find this')

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close search' }))

        expect(screen.queryByRole('textbox', { name: 'Find text' })).not.toBeInTheDocument()
    })

    it('stays open without blocking background focus, input, or scrolling and closes from outside Escape', async () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <input aria-label="Background input" />
                <div data-testid="background-scroll">
                    <MarkdownEditor markdown="searchable" onChange={onChange} />
                </div>
            </AppThemeProvider>,
        )
        const editor = screen.getAllByRole('textbox')[1]
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        expect(document.querySelector('.MuiBackdrop-root')).not.toBeInTheDocument()
        expect(document.body.style.overflow).not.toBe('hidden')
        const backgroundInput = screen.getByRole('textbox', { name: 'Background input' })
        fireEvent.click(backgroundInput)
        backgroundInput.focus()
        fireEvent.change(backgroundInput, { target: { value: 'still interactive' } })
        await waitFor(() => expect(backgroundInput).toHaveFocus())
        expect(backgroundInput).toHaveValue('still interactive')
        expect(screen.getByRole('textbox', { name: 'Find text' })).toBeInTheDocument()

        const renderedScrollContainer = screen.getByTestId('background-scroll')
        renderedScrollContainer.scrollTop = 20
        fireEvent.scroll(renderedScrollContainer)
        expect(renderedScrollContainer.scrollTop).toBe(20)

        fireEvent.keyDown(backgroundInput, { key: 'Escape' })
        expect(screen.queryByRole('textbox', { name: 'Find text' })).not.toBeInTheDocument()
    })

    it('renders popup inside the supplied overlay container', () => {
        const overlayContainer = document.createElement('div')
        document.body.append(overlayContainer)
        renderSearchEditor('content', { overlayContainer })

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))

        expect(overlayContainer).toContainElement(screen.getByRole('textbox', { name: 'Find text' }))
        overlayContainer.remove()
    })

    it('can opt out and leave Ctrl+F unhandled', () => {
        renderSearchEditor('prompt', { hideToolbar: true, localTextSearch: false })

        const browserEventAllowed = fireEvent.keyDown(screen.getByRole('textbox'), { ctrlKey: true, key: 'f' })

        expect(browserEventAllowed).toBe(true)
        expect(screen.queryByRole('textbox', { name: 'Find text' })).not.toBeInTheDocument()
    })

    it('opens expanded with Ctrl+H, seeds selected text, focuses search, and prevents browser history', () => {
        renderSearchEditor('before Bold after', { hideToolbar: true })
        const editor = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(editor, 7, 11)

        const browserEventAllowed = fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' })

        expect(browserEventAllowed).toBe(false)
        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveValue('Bold')
        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveFocus()
        expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Replace all' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Hide replace' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('expands and collapses replacement with the chevron while Ctrl+F and toolbar open find-only', () => {
        renderSearchEditor('Find this')
        const editor = screen.getAllByRole('textbox')[0]

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))
        expect(screen.queryByRole('textbox', { name: 'Replace with' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Show replace' }))
        expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Hide replace' }))
        expect(screen.queryByRole('textbox', { name: 'Replace with' })).not.toBeInTheDocument()

        fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' })
        expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeInTheDocument()
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        expect(screen.queryByRole('textbox', { name: 'Replace with' })).not.toBeInTheDocument()
    })

    it('keeps replacement actions disabled and the document unchanged until a find term is submitted', async () => {
        const { onChange } = renderSearchEditor('one two one')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 4)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })

        fireEvent.change(searchField, { target: { value: 'one' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), { target: { value: 'X' } })

        expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled()
        expect(editor).toHaveValue('one two one')
        expect(editor.selectionStart).toBe(4)
        expect(onChange).not.toHaveBeenCalled()

        fireEvent.keyDown(searchField, { key: 'Enter' })

        await waitFor(() => expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled())
        expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled()
        expect(editor).toHaveValue('one two one')
    })

    it('replaces only the current match, updates count, selects next match, and marks dirty', async () => {
        const { onDirtyChange } = renderSearchEditor('one two one two')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        await submitReplaceSearch(editor, 'two', 'X')
        expect(screen.getByText('2 results')).toBeInTheDocument()
        expect(editor.selectionStart).toBe(4)

        fireEvent.click(screen.getByRole('button', { name: 'Replace' }))

        await waitFor(() => expect(editor).toHaveValue('one X one two'))
        expect(screen.getByText('1 result')).toBeInTheDocument()
        expect(editor.selectionStart).toBe(10)
        expect(editor.selectionEnd).toBe(13)
        expect(onDirtyChange).toHaveBeenCalledWith(true)
    })

    it('replaces all matches through the data source as one undoable action', async () => {
        const dataSource = new SearchTestDataSource('one two one')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={historyStore}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        await submitReplaceSearch(editor, 'one', '1')

        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))

        await waitFor(() => expect(editor).toHaveValue('1 two 1'))
        expect(screen.getByText('0 results')).toBeInTheDocument()
        expect(dataSource.edit).toHaveBeenLastCalledWith('list-card', expect.anything(), '1 two 1')
        expect(historyStore.canUndo).toBe(true)

        act(() => {
            testLexicalEditor.dispatchCommand(UNDO_COMMAND, undefined)
        })

        await waitFor(() => expect(editor).toHaveValue('one two one'))
        expect(historyStore.canUndo).toBe(false)
    })

    it('applies match case and deletes matches with an empty replacement', async () => {
        renderSearchEditor('Alpha alpha')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' })
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
        await submitReplaceSearch(editor, 'alpha', '')

        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))

        await waitFor(() => expect(editor).toHaveValue('Alpha '))
    })

    it('leaves the document unchanged when replace all has zero matches', async () => {
        const { onChange, onDirtyChange } = renderSearchEditor('unchanged')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        await submitReplaceSearch(editor, 'missing', 'X')

        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))

        expect(editor).toHaveValue('unchanged')
        expect(screen.getByText('0 results')).toBeInTheDocument()
        expect(onChange).not.toHaveBeenCalled()
        expect(onDirtyChange).not.toHaveBeenCalledWith(true)
    })

    it('keeps search but disables replacement in read-only editors', async () => {
        const { onChange, onDirtyChange } = renderSearchEditor('locked text locked', { hideToolbar: true, readOnly: true })
        const editor = screen.getByRole('textbox') as HTMLTextAreaElement
        await submitReplaceSearch(editor, 'locked', 'open')

        expect(screen.getByText('2 results')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled()
        expect(editor).toHaveValue('locked text locked')
        expect(onChange).not.toHaveBeenCalled()
        expect(onDirtyChange).not.toHaveBeenCalledWith(true)
    })
})
