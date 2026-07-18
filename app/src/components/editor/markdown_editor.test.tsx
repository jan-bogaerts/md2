import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { THEME_MODE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { MARKDOWN_STYLE_PRESETS } from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownEditor } from './markdown_editor'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import { flushMarkdownEditors } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'

function renderEditor(markdown = '') {
    return render(
        <AppThemeProvider>
            <MarkdownEditor markdown={markdown} onChange={vi.fn()} />
        </AppThemeProvider>,
    )
}

function MarkdownEditorWithStyleControl() {
    const { setMarkdownStyle } = useAppTheme()
    const handleSetSerif = () => {
        setMarkdownStyle('serif')
    }

    return (
        <>
            <button onClick={handleSetSerif} type="button">Serif</button>
            <MarkdownEditor markdown="" onChange={vi.fn()} />
        </>
    )
}

describe('MarkdownEditor', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('renders the editing surface seeded with the markdown value', () => {
        renderEditor('# Title\n\nBody')

        expect(screen.getByRole('textbox')).toHaveValue('# Title\n\nBody')
    })

    it('does not propagate edits while typing', () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onChange).not.toHaveBeenCalled()
    })

    it('reports local dirty state without propagating the buffered edit', () => {
        const onChange = vi.fn()
        const onDirtyChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} onDirtyChange={onDirtyChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onDirtyChange).toHaveBeenLastCalledWith(true)
        expect(onChange).not.toHaveBeenCalled()

        flushMarkdownEditors()
        expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('reports live edits for a document without changing buffered flush behavior', () => {
        const historyStore = new MarkdownDocumentHistoryStore()
        const onDocumentChange = vi.fn()
        const onDocumentEdit = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    documentId="prompt"
                    historyStore={historyStore}
                    markdown="original"
                    onDocumentChange={onDocumentChange}
                    onDocumentEdit={onDocumentEdit}
                />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onDocumentEdit).toHaveBeenCalledExactlyOnceWith('prompt', 'edited')
        expect(onDocumentChange).not.toHaveBeenCalled()

        flushMarkdownEditors()
        expect(onDocumentChange).toHaveBeenCalledExactlyOnceWith('prompt', 'edited')
    })

    it('flushes a document edit on blur only when requested by its owner', () => {
        const historyStore = new MarkdownDocumentHistoryStore()
        const onDocumentChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    documentId="prompt"
                    flushOnBlur
                    historyStore={historyStore}
                    markdown="original"
                    onDocumentChange={onDocumentChange}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getByRole('textbox')
        fireEvent.focus(editor)
        fireEvent.change(editor, { target: { value: 'edited' } })

        fireEvent.blur(editor)

        expect(onDocumentChange).toHaveBeenCalledExactlyOnceWith('prompt', 'edited')
    })

    it('keeps the default document edit buffered on blur', () => {
        const historyStore = new MarkdownDocumentHistoryStore()
        const onDocumentChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    documentId="card"
                    historyStore={historyStore}
                    markdown="original"
                    onDocumentChange={onDocumentChange}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getByRole('textbox')
        fireEvent.focus(editor)
        fireEvent.change(editor, { target: { value: 'edited' } })

        fireEvent.blur(editor)

        expect(onDocumentChange).not.toHaveBeenCalled()
    })

    it('replaces active document content when its external Markdown changes under the same id', () => {
        const historyStore = new MarkdownDocumentHistoryStore()
        const onDocumentChange = vi.fn()
        const view = render(
            <AppThemeProvider>
                <MarkdownEditor
                    documentId="prompt"
                    historyStore={historyStore}
                    markdown="original"
                    onDocumentChange={onDocumentChange}
                />
            </AppThemeProvider>,
        )

        view.rerender(
            <AppThemeProvider>
                <MarkdownEditor
                    documentId="prompt"
                    historyStore={historyStore}
                    markdown="external"
                    onDocumentChange={onDocumentChange}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('textbox')).toHaveValue('external')
        expect(onDocumentChange).not.toHaveBeenCalled()
        expect(historyStore.canUndo).toBe(false)
        expect(historyStore.canRedo).toBe(false)
    })

    it('does not flush editor-normalized markdown when the user made no edit', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original  \n" onChange={onChange} />
            </AppThemeProvider>,
        )

        unmount()

        expect(onChange).not.toHaveBeenCalled()
    })

    it('flushes pending edits through onChange on unmount', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        unmount()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('flushes pending edits when the app-level flush runs', () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        flushMarkdownEditors()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('does not flush again when the content did not change since the last flush', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        flushMarkdownEditors()
        unmount()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('renders the formatting toolbar inside the markdown editor', () => {
        renderEditor()

        expect(screen.getByTestId('mdx-editor')).toContainElement(screen.getByTestId('mdx-editor-toolbar'))
    })

    it('omits the toolbar when hideToolbar is set', () => {
        render(
            <AppThemeProvider>
                <MarkdownEditor hideToolbar markdown="" onChange={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.queryByTestId('mdx-editor-toolbar')).not.toBeInTheDocument()
    })

    it('reports live edits through onLiveChange while buffering onChange', () => {
        const onChange = vi.fn()
        const onLiveChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} onLiveChange={onLiveChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onLiveChange).toHaveBeenLastCalledWith('edited')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('renders read-only when requested', () => {
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="locked" onChange={vi.fn()} readOnly />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    })

    it('shows placeholder insertion only when placeholders are configured', () => {
        const view = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} placeholders={ACTION_PROMPT_PLACEHOLDERS} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Insert placeholder' })).toBeInTheDocument()

        view.rerender(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('button', { name: 'Insert placeholder' })).not.toBeInTheDocument()
    })

    it('uses the MDXEditor palette matching the app theme', () => {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark')

        renderEditor()

        expect(screen.getByTestId('mdx-editor')).toHaveClass('dark-theme')
    })

    it('marks the toolbar sticky when requested for mobile layout', () => {
        const { container, rerender } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar />
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()

        rerender(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar={false} />
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="false"]')).not.toBeNull()
    })

    it('maps markdown sections to scoped content selectors', () => {
        const styleSx = buildMarkdownContentSx(MARKDOWN_STYLE_PRESETS.handwritten)

        expect(styleSx).toMatchObject({
            '& .mdxeditor-content h1': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.title1.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.title1.fontSize,
                fontStyle: 'normal',
                fontWeight: 700,
                textDecoration: 'none',
            },
            '& .mdxeditor-content p': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.body.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.body.fontSize,
            },
            '& .mdxeditor-content a': {textDecoration: 'underline'},
            '& .mdxeditor-content blockquote, & .mdxeditor-content blockquote p': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.blockquote.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.blockquote.fontSize,
                fontStyle: 'italic',
            },
            '& .mdxeditor-content :not(pre) > code': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.inlineCode.fontFamily},
            '& .mdxeditor-content pre, & .mdxeditor-content pre code': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.codeBlock.fontFamily},
            '& .mdxeditor-content table, & .mdxeditor-content th, & .mdxeditor-content td': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.table.fontFamily},
        })
    })

    it('updates editor styles when the markdown preset changes', () => {
        const { container } = render(
            <AppThemeProvider>
                <MarkdownEditorWithStyleControl />
            </AppThemeProvider>,
        )
        const editorWrapper = container.querySelector('[data-sticky-toolbar="false"]')
        const initialClassName = editorWrapper?.className

        fireEvent.click(screen.getByRole('button', { name: 'Serif' }))

        expect(editorWrapper?.className).not.toBe(initialClassName)
    })
})
