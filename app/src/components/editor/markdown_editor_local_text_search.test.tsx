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

    it('defaults to case-insensitive search and reevaluates when match-case changes', async () => {
        renderSearchEditor('Alpha ALPHA')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 0)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        fireEvent.change(screen.getByRole('textbox', { name: 'Find text' }), { target: { value: 'ALPHA' } })
        await waitFor(() => expect(editor.selectionStart).toBe(0))

        const matchCase = screen.getByRole('button', { name: 'Match case' })
        expect(matchCase).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(matchCase)

        await waitFor(() => expect(editor.selectionStart).toBe(6))
        expect(matchCase).toHaveAttribute('aria-pressed', 'true')
    })

    it('uses F3 for next match and wraps after the final match', async () => {
        renderSearchEditor('one two one')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })
        const searchField = screen.getByRole('textbox', { name: 'Find text' })
        fireEvent.change(searchField, { target: { value: 'one' } })
        await waitFor(() => expect(editor.selectionStart).toBe(0))

        fireEvent.keyDown(searchField, { key: 'F3' })
        await waitFor(() => expect(editor.selectionStart).toBe(8))
        fireEvent.keyDown(searchField, { key: 'F3' })

        await waitFor(() => expect(editor.selectionStart).toBe(0))
    })

    it('leaves selection and editor state unchanged for a missing term', async () => {
        const { onChange, onDirtyChange } = renderSearchEditor('unchanged')
        const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement
        selectText(editor, 3)
        fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' })

        fireEvent.change(screen.getByRole('textbox', { name: 'Find text' }), { target: { value: 'missing' } })

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

        fireEvent.change(screen.getByRole('textbox', { name: 'Find text' }), { target: { value: 'one' } })
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
