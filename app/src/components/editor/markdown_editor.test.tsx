import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, type ReactNode } from 'react'
import { AppThemeContext } from '../../theme/theme_context'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { dialogService } from '../../services/dialog_service'
import { THEME_MODE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { MARKDOWN_STYLE_PRESETS } from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown_editor'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import { flushMarkdownEditors } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'
import {
    MarkdownDataSourceBase,
    type MarkdownBindingKind,
    type MarkdownDataSource,
    type MarkdownDocumentTarget,
} from './markdown_data_source'
import type { CardOpenDocument } from '../../services/open_files_service'

class TestMarkdownDataSource extends MarkdownDataSourceBase {
    readonly commit = vi.fn<MarkdownDataSource['commit']>(() => true)
    readonly edit = vi.fn()
    private readonly markdownByTarget = new Map<MarkdownDocumentTarget, string>()
    private readonly targets = new Map<string, MarkdownDocumentTarget>()

    getMarkdown(target: MarkdownDocumentTarget) {
        const markdown = this.markdownByTarget.get(target)
        if (markdown === undefined) throw new Error('Unknown test document')
        return markdown
    }

    select(binding: MarkdownBindingKind, identity: string, markdown: string) {
        const target = this.target(identity)
        this.markdownByTarget.set(target, markdown)
        this.setActiveTarget(binding, target)
        return target
    }

    replace(target: MarkdownDocumentTarget, markdown: string, originBinding: MarkdownBindingKind | null = null) {
        this.markdownByTarget.set(target, markdown)
        this.dispatchMarkdownReplaced({ originBinding, target })
    }

    target(identity: string) {
        const existing = this.targets.get(identity)
        if (existing) return existing
        const document = Object.assign(new EventTarget(), { kind: 'card' as const }) as CardOpenDocument
        const target: MarkdownDocumentTarget = { document }
        this.targets.set(identity, target)
        return target
    }
}

function renderEditor(markdown = '') {
    return render(
        <AppThemeProvider>
            <MarkdownEditor markdown={markdown} onChange={vi.fn()} />
        </AppThemeProvider>,
    )
}

function selectText(textbox: HTMLTextAreaElement, start: number, end: number) {
    textbox.setSelectionRange(start, end)
    fireEvent.select(textbox)
}

function clipboardData(initialData: Record<string, string> = {}) {
    const data = new Map(Object.entries(initialData))
    return {
        getData: (type: string) => data.get(type) ?? '',
        setData: (type: string, value: string) => data.set(type, value),
        value: (type: string) => data.get(type) ?? '',
    }
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

function MarkdownContentSxOverride({ children }: { children: ReactNode }) {
    const theme = useAppTheme()
    const value = { ...theme, markdownContentSx: { paddingTop: '37px' } }

    return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
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

    it('disables MDX and HTML processing', () => {
        renderEditor()

        expect(document.querySelector('[data-html-processing-suppressed="true"]')).not.toBeNull()
    })

    it('reports Markdown parser errors through the dialog service', () => {
        const reportError = vi.spyOn(dialogService, 'error')
        renderEditor()

        fireEvent.click(screen.getByTestId('emit-markdown-error'))

        expect(reportError).toHaveBeenCalledExactlyOnceWith(
            new Error('Invalid Markdown'),
            { fallbackMessage: 'Markdown could not be parsed' },
        )
        reportError.mockRestore()
    })

    it('imports plain clipboard text as markdown', () => {
        const markdown = '# Title\n\n- Item\n\n[Link](https://example.com)\n\n```js\nconst value = 1;\n```'
        renderEditor()

        const pasteHandled = fireEvent.paste(screen.getByRole('textbox'), {clipboardData: {getData: (type: string) => type === 'text/plain' ? markdown : ''}})

        expect(pasteHandled).toBe(false)
        expect(screen.getByRole('textbox')).toHaveValue(markdown)
    })

    it('prefers explicit markdown clipboard content over plain text', () => {
        renderEditor()

        fireEvent.paste(screen.getByRole('textbox'), {clipboardData: {getData: (type: string) => type === 'text/markdown' ? '**Markdown**' : 'Plain text'}})

        expect(screen.getByRole('textbox')).toHaveValue('**Markdown**')
    })

    it('leaves non-text clipboard data to the editor', () => {
        renderEditor()

        const pasteHandled = fireEvent.paste(screen.getByRole('textbox'), {clipboardData: { getData: () => '' }})

        expect(pasteHandled).toBe(true)
        expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('copies selected formatted content as Markdown in both text formats', () => {
        const markdown = '# Title\n\n**Bold** and [Link](https://example.com)\n\n- Item\n\n`code`'
        renderEditor(markdown)
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        const clipboard = clipboardData()
        selectText(textbox, 0, markdown.length)

        const copyHandled = fireEvent.copy(textbox, { clipboardData: clipboard })

        expect(copyHandled).toBe(false)
        expect(clipboard.value('text/markdown')).toBe(markdown)
        expect(clipboard.value('text/plain')).toBe(markdown)
    })

    it('copies only rendered text with Ctrl+Shift+C', () => {
        const markdown = '**Bold** and [Link](https://example.com)'
        renderEditor(markdown)
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        const clipboard = clipboardData()
        selectText(textbox, 0, markdown.length)

        fireEvent.keyDown(textbox, { ctrlKey: true, key: 'c', shiftKey: true })
        fireEvent.copy(textbox, { clipboardData: clipboard })

        expect(clipboard.value('text/plain')).toBe('Bold and Link')
        expect(clipboard.value('text/markdown')).toBe('')
    })

    it('preserves formatting around a partial copied selection', () => {
        renderEditor('Before **bold text** after')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        const clipboard = clipboardData()
        selectText(textbox, 9, 13)

        fireEvent.copy(textbox, { clipboardData: clipboard })

        expect(clipboard.value('text/markdown')).toBe('**bold**')
        expect(clipboard.value('text/plain')).toBe('**bold**')
    })

    it('leaves clipboard data unchanged for a collapsed selection', () => {
        renderEditor('Text')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        const clipboard = clipboardData({ 'text/plain': 'existing' })
        selectText(textbox, 2, 2)

        const copyHandled = fireEvent.copy(textbox, { clipboardData: clipboard })

        expect(copyHandled).toBe(true)
        expect(clipboard.value('text/plain')).toBe('existing')
    })

    it('replaces the current selection when pasting Markdown', () => {
        renderEditor('before old after')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(textbox, 7, 10)

        fireEvent.paste(textbox, { clipboardData: clipboardData({ 'text/plain': '**new**' }) })

        expect(textbox).toHaveValue('before **new** after')
    })

    it('inserts plain clipboard text literally with Ctrl+Shift+V', () => {
        renderEditor('old')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(textbox, 0, 3)

        fireEvent.keyDown(textbox, { ctrlKey: true, key: 'v', shiftKey: true })
        fireEvent.paste(textbox, { clipboardData: clipboardData({ 'text/plain': '**bold**' }) })

        expect(textbox).toHaveValue('**bold**')
    })

    it('consumes shifted copy intent once', () => {
        const markdown = '**Bold**'
        renderEditor(markdown)
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(textbox, 0, markdown.length)
        const textClipboard = clipboardData()
        const markdownClipboard = clipboardData()

        fireEvent.keyDown(textbox, { ctrlKey: true, key: 'c', shiftKey: true })
        fireEvent.copy(textbox, { clipboardData: textClipboard })
        fireEvent.copy(textbox, { clipboardData: markdownClipboard })

        expect(textClipboard.value('text/plain')).toBe('Bold')
        expect(markdownClipboard.value('text/markdown')).toBe(markdown)
    })

    it('clears shifted paste intent when no matching clipboard event follows', async () => {
        renderEditor('')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement

        fireEvent.keyDown(textbox, { ctrlKey: true, key: 'v', shiftKey: true })
        await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
        fireEvent.paste(textbox, { clipboardData: clipboardData({ 'text/plain': '**bold**' }) })

        expect(textbox).toHaveValue('**bold**')
    })

    it('allows copy but prevents paste changes in read-only editors', () => {
        const markdown = '**locked**'
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown={markdown} onChange={vi.fn()} readOnly />
            </AppThemeProvider>,
        )
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        const clipboard = clipboardData()
        selectText(textbox, 0, markdown.length)

        fireEvent.copy(textbox, { clipboardData: clipboard })
        fireEvent.paste(textbox, { clipboardData: clipboardData({ 'text/plain': 'changed' }) })

        expect(clipboard.value('text/markdown')).toBe(markdown)
        expect(textbox).toHaveValue(markdown)
    })

    it('reports clipboard write failures without preventing default copy', () => {
        const reportError = vi.spyOn(dialogService, 'error')
        renderEditor('Text')
        const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
        selectText(textbox, 0, 4)
        const clipboard = {
            getData: () => '',
            setData: () => { throw new Error('Clipboard unavailable') },
        }

        const copyHandled = fireEvent.copy(textbox, { clipboardData: clipboard })

        expect(copyHandled).toBe(true)
        expect(reportError).toHaveBeenCalledWith(
            new Error('Clipboard unavailable'),
            { fallbackMessage: 'Selected content could not be copied' },
        )
        reportError.mockRestore()
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
        const target = dataSource.select('list-action', 'prompt', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={dataSource}
                    historyStore={historyStore}
                />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(dataSource.edit).toHaveBeenCalledExactlyOnceWith('list-action', target, 'edited')
        expect(dataSource.commit).not.toHaveBeenCalled()

        flushMarkdownEditors()
        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('list-action', target, 'edited')
    })

    it('keeps a failed editor dirty without blocking another editor flush', () => {
        const failedDataSource = new TestMarkdownDataSource()
        const successfulDataSource = new TestMarkdownDataSource()
        const failedTarget = failedDataSource.select('list-card', 'failed-card', 'failed original')
        const savedTarget = successfulDataSource.select('board-card', 'saved-card', 'saved original')
        failedDataSource.commit.mockReturnValue(false)
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={failedDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                />
                <MarkdownEditor
                    binding="board-card"
                    dataSource={successfulDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                />
            </AppThemeProvider>,
        )
        const [failedEditor, successfulEditor] = screen.getAllByRole('textbox')
        fireEvent.change(failedEditor, { target: { value: 'failed edit' } })
        fireEvent.change(successfulEditor, { target: { value: 'saved edit' } })

        flushMarkdownEditors()

        expect(failedDataSource.commit).toHaveBeenCalledExactlyOnceWith('list-card', failedTarget, 'failed edit')
        expect(successfulDataSource.commit).toHaveBeenCalledExactlyOnceWith('board-card', savedTarget, 'saved edit')
    })

    it('drops the dirty buffer without committing when the binding clears with discard', () => {
        const dataSource = new TestMarkdownDataSource()
        dataSource.select('list-card', 'card-1', 'original')
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                />
            </AppThemeProvider>,
        )
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        act(() => dataSource.clearBindings(true))

        expect(dataSource.commit).not.toHaveBeenCalled()
        expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('keeps the outgoing dirty document active until a failed switch can retry', async () => {
        const dataSource = new TestMarkdownDataSource()
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
                />
            </AppThemeProvider>,
        )
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first edited' } })

        act(() => dataSource.select('list-card', 'second-card', 'second original'))

        expect(editorRef.current?.getMarkdown()).toBe('first edited')

        dataSource.commit.mockReturnValue(true)
        await act(async () => {
            flushMarkdownEditors()
            await Promise.resolve()
        })

        expect(screen.getByRole('textbox')).toHaveValue('second original')
    })

    it('keeps the origin editor intact while synchronizing another binding for the same document', () => {
        const dataSource = new TestMarkdownDataSource()
        const boardEditorRef = createRef<MarkdownEditorHandle>()
        const listEditorRef = createRef<MarkdownEditorHandle>()
        const sharedTarget = dataSource.select('board-card', 'shared-card', 'original')
        dataSource.select('list-card', 'shared-card', 'original')
        dataSource.commit.mockImplementation((binding, target, markdown) => {
            dataSource.replace(target, markdown, binding)
            return true
        })
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="board-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    ref={boardEditorRef}
                />
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    ref={listEditorRef}
                />
            </AppThemeProvider>,
        )
        const [boardEditor] = screen.getAllByRole('textbox')
        fireEvent.change(boardEditor, { target: { value: 'board edit' } })

        flushMarkdownEditors()

        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('board-card', sharedTarget, 'board edit')
        expect(boardEditorRef.current?.getMarkdown()).toBe('board edit')
        expect(listEditorRef.current?.getMarkdown()).toBe('board edit')
    })

    it('flushes a data-source edit on blur only when requested', () => {
        const dataSource = new TestMarkdownDataSource()
        const target = dataSource.select('list-action', 'prompt', 'original')
        const historyStore = new MarkdownDocumentHistoryStore()
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={dataSource}
                    flushOnBlur
                    historyStore={historyStore}
                />
            </AppThemeProvider>,
        )
        const editor = screen.getByRole('textbox')
        fireEvent.focus(editor)
        fireEvent.change(editor, { target: { value: 'edited' } })

        fireEvent.blur(editor)

        expect(dataSource.commit).toHaveBeenCalledExactlyOnceWith('list-action', target, 'edited')
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
                />
            </AppThemeProvider>,
        )

        act(() => dataSource.replace(dataSource.target('prompt'), 'external'))

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

    it('does not infer read-only state from an empty data-source binding', () => {
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={new TestMarkdownDataSource()}
                    historyStore={new MarkdownDocumentHistoryStore()}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly')
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

    it('marks the toolbar sticky by default', () => {
        const { container } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
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
        const editorWrapper = container.querySelector('[data-sticky-toolbar="true"]')
        const initialClassName = editorWrapper?.className

        fireEvent.click(screen.getByRole('button', { name: 'Serif' }))

        expect(editorWrapper?.className).not.toBe(initialClassName)
    })

    it('uses the derived Markdown style provided by the app theme', () => {
        const { container } = render(
            <AppThemeProvider>
                <MarkdownContentSxOverride>
                    <MarkdownEditor markdown="" onChange={vi.fn()} />
                </MarkdownContentSxOverride>
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="true"]')).toHaveStyle({ paddingTop: '37px' })
    })
})
