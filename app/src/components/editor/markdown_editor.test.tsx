import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { THEME_MODE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { MARKDOWN_STYLE_PRESETS } from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown_editor'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import { flushMarkdownEditors } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'
import { MarkdownDataSourceBase, type MarkdownBindingKind, type MarkdownDataSource } from './markdown_data_source'
import { MarkdownEditorStateStore } from './markdown_editor_state_store'

class TestMarkdownDataSource extends MarkdownDataSourceBase {
    readonly commit = vi.fn<MarkdownDataSource['commit']>(() => true)
    readonly edit = vi.fn()
    private readonly markdownByDocumentId = new Map<string, string>()

    getMarkdown(documentId: string) {
        const markdown = this.markdownByDocumentId.get(documentId)
        if (markdown === undefined) throw new Error(`Unknown test document: ${documentId}`)
        return markdown
    }

    select(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        this.markdownByDocumentId.set(documentId, markdown)
        this.setActiveDocument(binding, documentId)
    }

    replace(documentId: string, markdown: string, originBinding: MarkdownBindingKind | null = null) {
        this.markdownByDocumentId.set(documentId, markdown)
        this.dispatchMarkdownReplaced({ documentId, originBinding })
    }
}

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

    it('stages data-source edits and keeps commit buffered until flush', () => {
        const dataSource = new TestMarkdownDataSource()
        dataSource.select('list-action', 'prompt', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={dataSource}
                    historyStore={historyStore}
                    stateStore={new MarkdownEditorStateStore()}
                />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(dataSource.edit).toHaveBeenCalledExactlyOnceWith('list-action', 'prompt', 'edited')
        expect(dataSource.commit).not.toHaveBeenCalled()

        flushMarkdownEditors()
        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('list-action', 'prompt', 'edited')
    })

    it('keeps a failed editor dirty without blocking another editor flush', () => {
        const failedDataSource = new TestMarkdownDataSource()
        const successfulDataSource = new TestMarkdownDataSource()
        const failedStateStore = new MarkdownEditorStateStore()
        const successfulStateStore = new MarkdownEditorStateStore()
        failedDataSource.select('list-card', 'failed-card', 'failed original')
        successfulDataSource.select('board-card', 'saved-card', 'saved original')
        failedDataSource.commit.mockReturnValue(false)
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={failedDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    stateStore={failedStateStore}
                />
                <MarkdownEditor
                    binding="board-card"
                    dataSource={successfulDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    stateStore={successfulStateStore}
                />
            </AppThemeProvider>,
        )
        const [failedEditor, successfulEditor] = screen.getAllByRole('textbox')
        fireEvent.change(failedEditor, { target: { value: 'failed edit' } })
        fireEvent.change(successfulEditor, { target: { value: 'saved edit' } })

        flushMarkdownEditors()

        expect(failedDataSource.commit).toHaveBeenCalledExactlyOnceWith('list-card', 'failed-card', 'failed edit')
        expect(successfulDataSource.commit).toHaveBeenCalledExactlyOnceWith('board-card', 'saved-card', 'saved edit')
        expect(failedStateStore.getSnapshot()).toBe(true)
        expect(successfulStateStore.getSnapshot()).toBe(false)
    })

    it('drops the dirty buffer without committing when the binding clears with discard', () => {
        const dataSource = new TestMarkdownDataSource()
        const stateStore = new MarkdownEditorStateStore()
        dataSource.select('list-card', 'card-1', 'original')
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    stateStore={stateStore}
                />
            </AppThemeProvider>,
        )
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        act(() => dataSource.clearBindings(true))

        expect(dataSource.commit).not.toHaveBeenCalled()
        expect(stateStore.getSnapshot()).toBe(false)
        expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('keeps the outgoing dirty document active until a failed switch can retry', async () => {
        const dataSource = new TestMarkdownDataSource()
        const stateStore = new MarkdownEditorStateStore()
        const editorRef = createRef<MarkdownEditorHandle>()
        dataSource.select('list-card', 'first-card', 'first original')
        dataSource.commit.mockReturnValue(false)
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    ref={editorRef}
                    stateStore={stateStore}
                />
            </AppThemeProvider>,
        )
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first edited' } })

        act(() => dataSource.select('list-card', 'second-card', 'second original'))

        expect(editorRef.current?.getMarkdown()).toBe('first edited')
        expect(stateStore.getSnapshot()).toBe(true)

        dataSource.commit.mockReturnValue(true)
        await act(async () => {
            flushMarkdownEditors()
            await Promise.resolve()
        })

        expect(screen.getByRole('textbox')).toHaveValue('second original')
        expect(stateStore.getSnapshot()).toBe(false)
    })

    it('keeps the origin editor intact while synchronizing another binding for the same document', () => {
        const dataSource = new TestMarkdownDataSource()
        const boardEditorRef = createRef<MarkdownEditorHandle>()
        const listEditorRef = createRef<MarkdownEditorHandle>()
        const boardStateStore = new MarkdownEditorStateStore()
        const listStateStore = new MarkdownEditorStateStore()
        dataSource.select('board-card', 'shared-card', 'original')
        dataSource.select('list-card', 'shared-card', 'original')
        dataSource.commit.mockImplementation((binding, documentId, markdown) => {
            dataSource.replace(documentId, markdown, binding)
            return true
        })
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="board-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    ref={boardEditorRef}
                    stateStore={boardStateStore}
                />
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    ref={listEditorRef}
                    stateStore={listStateStore}
                />
            </AppThemeProvider>,
        )
        const [boardEditor] = screen.getAllByRole('textbox')
        fireEvent.change(boardEditor, { target: { value: 'board edit' } })

        flushMarkdownEditors()

        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('board-card', 'shared-card', 'board edit')
        expect(boardEditorRef.current?.getMarkdown()).toBe('board edit')
        expect(listEditorRef.current?.getMarkdown()).toBe('board edit')
        expect(boardStateStore.getSnapshot()).toBe(false)
        expect(listStateStore.getSnapshot()).toBe(false)
    })

    it('flushes a data-source edit on blur only when requested', () => {
        const dataSource = new TestMarkdownDataSource()
        dataSource.select('list-action', 'prompt', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={dataSource}
                    flushOnBlur
                    historyStore={historyStore}
                    stateStore={new MarkdownEditorStateStore()}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getByRole('textbox')
        fireEvent.focus(editor)
        fireEvent.change(editor, { target: { value: 'edited' } })

        fireEvent.blur(editor)

        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('list-action', 'prompt', 'edited')
    })

    it('keeps default data-source edits buffered on blur', () => {
        const dataSource = new TestMarkdownDataSource()
        dataSource.select('list-card', 'card', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={historyStore}
                    stateStore={new MarkdownEditorStateStore()}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getByRole('textbox')
        fireEvent.focus(editor)
        fireEvent.change(editor, { target: { value: 'edited' } })

        fireEvent.blur(editor)

        expect(dataSource.commit).not.toHaveBeenCalled()
    })

    it('replaces matching active content from a non-origin source event', () => {
        const dataSource = new TestMarkdownDataSource()
        dataSource.select('list-action', 'prompt', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={dataSource}
                    historyStore={historyStore}
                    stateStore={new MarkdownEditorStateStore()}
                />
            </AppThemeProvider>,
        )

        act(() => dataSource.replace('prompt', 'external'))

        expect(screen.getByRole('textbox')).toHaveValue('external')
        expect(dataSource.commit).not.toHaveBeenCalled()
        expect(historyStore.canUndo).toBe(false)
        expect(historyStore.canRedo).toBe(false)
    })

    it('does not report editor-normalized markdown as a user edit', () => {
        const onChange = vi.fn()
        const onDirtyChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original  \n" onChange={onChange} onDirtyChange={onDirtyChange} />
            </AppThemeProvider>,
        )

        expect(onDirtyChange).not.toHaveBeenCalledWith(true)
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
