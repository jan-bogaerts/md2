import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import type { CardOpenDocument } from '../../services/open_files_service'
import { MarkdownEditor } from './markdown_editor'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import {
    MarkdownDataSourceBase,
    type MarkdownDataSource,
    type MarkdownDocumentTarget,
} from './markdown_data_source'

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

describe('MarkdownEditor local text search', () => {
    afterEach(cleanup)

    it('opens from the shared toolbar search button', () => {
        renderSearchEditor('Find this')

        fireEvent.click(screen.getByRole('button', { name: 'Find text' }))

        expect(screen.getByRole('textbox', { name: 'Find text' })).toHaveFocus()
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

    it('does not search on match-case changes and submits the selected case mode', async () => {
        renderSearchEditor('Alpha ALPHA')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 0)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'ALPHA' } })
        const matchCase = screen.getByRole('button', { name: 'Match case' })

        expect(matchCase).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(matchCase)

        expect(editor.selectionStart).toBe(0)
        expect(editor.selectionEnd).toBe(0)
        expect(matchCase).toHaveAttribute('aria-pressed', 'true')

        fireEvent.keyDown(searchField, { key: 'Enter' })

        await waitFor(() => expect(editor.selectionStart).toBe(6))
        expect(editor.selectionEnd).toBe(11)
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

    it('uses submitted term and case mode for F3 despite later draft changes', async () => {
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
        expect(screen.getByText('2 results')).toBeInTheDocument()
        fireEvent.keyDown(searchField, { key: 'F3' })

        await waitFor(() => expect(editor.selectionStart).toBe(12))
        expect(editor.selectionEnd).toBe(17)

        fireEvent.keyDown(searchField, { key: 'F3' })

        await waitFor(() => expect(editor.selectionStart).toBe(0))
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
})
