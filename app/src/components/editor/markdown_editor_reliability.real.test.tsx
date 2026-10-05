import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { LinkNode } from '@lexical/link';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    $createParagraphNode, $createTextNode, $getRoot, $isTextNode, $nodesOfType, COPY_COMMAND, PASTE_COMMAND, UNDO_COMMAND,
    getNearestEditorFromDOMNode,
} from 'lexical';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownDraft } from '../../services/markdown/markdown_draft';
import { dialogService } from '../../services/dialog_service';
import { AppThemeProvider } from '../../theme/theme_provider';
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown_editor';
import { MarkdownDocumentHistoryStore } from './history/markdown_document_history_store';
import { MarkdownReliabilityDataSourceFixture } from './markdown_reliability_data_source_fixture';

const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU2EAAAAASUVORK5CYII=';

function renderEditor(markdown: string, readOnly = false, compact = false) {
    const handle = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const onDirtyChange = vi.fn();
    render(<AppThemeProvider><MarkdownEditor hideToolbar={compact} markdown={markdown} onChange={onChange}
        onDirtyChange={onDirtyChange} readOnly={readOnly} ref={handle} /></AppThemeProvider>);
    return { handle, onChange, onDirtyChange };
}

function richEditor() {
    const element = document.querySelector('.mdxeditor-content');
    if (!element) throw new Error('Rich editor is missing');
    const editor = getNearestEditorFromDOMNode(element);
    if (!editor) throw new Error('Lexical editor is missing');
    return editor;
}

function appendRichParagraph(text = 'Unrelated edit') {
    act(() => richEditor().update(() => $getRoot().append($createParagraphNode().append($createTextNode(text))), { discrete: true }));
}

function sourceEditor() {
    const element = document.querySelector('.mdxeditor-source-editor .cm-editor');
    if (!element) throw new Error('Source editor is missing');
    const editor = EditorView.findFromDOM(element as HTMLElement);
    if (!editor) throw new Error('CodeMirror editor is missing');
    return editor;
}

function replaceSource(markdown: string) {
    const editor = sourceEditor();
    act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: markdown }, userEvent: 'input' }));
}

async function selectMode(name: 'Source' | 'Rich text') {
    await userEvent.click(screen.getByRole('button', { name }));
}

describe('Markdown reliability with installed MDXEditor', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it.each(['first  \nsecond', 'first\\\nsecond'])('keeps hard breaks through edit and reopen: %s', (markdown) => {
        const { handle } = renderEditor(markdown);
        expect(document.querySelector('.mdxeditor-content br')).toBeInTheDocument();
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        expect(saved).toMatch(/first(?: {2}|\\)\nsecond/u);
        cleanup();
        renderEditor(saved);
        expect(document.querySelector('.mdxeditor-content br')).toBeInTheDocument();
    });

    it('keeps a soft newline soft after an unrelated edit', () => {
        const { handle } = renderEditor('first\nsecond');
        appendRichParagraph();
        expect(handle.current?.getMarkdown()).toContain('first\nsecond');
        expect(document.querySelector('.mdxeditor-content br')).not.toBeInTheDocument();
    });

    it('imports full, collapsed and shortcut references with case and whitespace normalization', () => {
        const markdown = '[First][  DOC  KEY ] [Doc Key][] [doc key]\n\n[Doc Key]: https://example.com "Title"';
        const { handle } = renderEditor(markdown);
        expect(screen.getAllByRole('link')).toHaveLength(3);
        screen.getAllByRole('link').forEach((link) => expect(link).toHaveAttribute('href', 'https://example.com'));
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        expect(saved).toContain('[Doc Key]: https://example.com "Title"');
        cleanup();
        renderEditor(saved);
        expect(screen.getAllByRole('link')).toHaveLength(3);
    });

    it('preserves unused definitions and shared definitions after edits and reopen', () => {
        const markdown = '[one][doc] [two][doc]\n\n[doc]: https://example.com\n[unused]: https://unused.example "Unused"';
        const { handle } = renderEditor(markdown);
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        expect(saved.match(/\[doc\]:/gu)).toHaveLength(1);
        expect(saved).toContain('[unused]: https://unused.example "Unused"');
        cleanup();
        renderEditor(saved);
        expect(screen.getAllByRole('link')).toHaveLength(2);
    });

    it('keeps definitions in a document containing only definitions', () => {
        const { handle } = renderEditor('[unused]: https://example.com');
        appendRichParagraph();
        expect(handle.current?.getMarkdown()).toContain('[unused]: https://example.com');
    });

    it('resolves references in tables and blockquotes', () => {
        const { handle } = renderEditor('| Link |\n| --- |\n| [table][doc] |\n\n> [quote][doc]\n\n[doc]: https://example.com');
        expect(screen.getByRole('link', { name: 'table' })).toHaveAttribute('href', 'https://example.com');
        expect(screen.getByRole('link', { name: 'quote' })).toHaveAttribute('href', 'https://example.com');
        appendRichParagraph();
        expect(handle.current?.getMarkdown()).toContain('[table][doc]');
    });

    it('retains image references and their titles after an unrelated edit', () => {
        const { handle } = renderEditor(`![pixel][picture]\n\n[picture]: ${IMAGE} "Pixel"`);
        appendRichParagraph();
        expect(handle.current?.getMarkdown()).toContain('![pixel][picture]');
        expect(handle.current?.getMarkdown()).toContain(`[picture]: ${IMAGE} "Pixel"`);
    });

    it('detaches only the reference whose destination is edited', () => {
        const { handle } = renderEditor('[one][doc] [two][doc]\n\n[doc]: https://example.com');
        act(() => richEditor().update(() => $nodesOfType(LinkNode)[0].setURL('https://changed.example'), { discrete: true }));
        const saved = handle.current?.getMarkdown() ?? '';
        expect(saved).toContain('[one](https://changed.example)');
        expect(saved).toContain('[two][doc]');
        expect(saved).toContain('[doc]: https://example.com');
    });

    it('copies a selected reference with its required definition', () => {
        renderEditor('[one][doc] [two][other]\n\n[doc]: https://example.com\n[other]: https://other.example');
        act(() => richEditor().update(() => $nodesOfType(LinkNode)[0].select(0, 1), { discrete: true }));
        const values = new Map<string, string>();
        const clipboardData = { setData: (type: string, value: string) => values.set(type, value) };
        const event = new Event('copy', { cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: clipboardData });
        act(() => richEditor().dispatchCommand(COPY_COMMAND, event as ClipboardEvent));
        expect(values.get('text/markdown')).toContain('[doc]: https://example.com');
        expect(values.get('text/markdown')).not.toContain('[other]:');
        expect(values.get('text/plain')).toBe(values.get('text/markdown'));
    });

    it('copies a selected reference image with its required definition', () => {
        renderEditor(`![pixel][picture]\n\n[picture]: ${IMAGE} "Pixel"`);
        act(() => richEditor().update(() => $getRoot().select(0, 1), { discrete: true }));
        const setData = vi.fn();
        const event = new Event('copy', { cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { setData } });
        act(() => richEditor().dispatchCommand(COPY_COMMAND, event as ClipboardEvent));
        expect(setData).toHaveBeenCalledWith('text/markdown', expect.stringContaining(`[picture]: ${IMAGE} "Pixel"`));
    });

    it('keeps an edited shortcut caption attached to its original definition', () => {
        const { handle } = renderEditor('[doc]\n\n[doc]: https://example.com');
        act(() => richEditor().update(() => {
            const text = $nodesOfType(LinkNode)[0].getFirstChild();
            if (!$isTextNode(text)) throw new Error('Link caption is missing');
            text.setTextContent('New caption');
        }, { discrete: true }));
        expect(handle.current?.getMarkdown()).toContain('[New caption][doc]');
    });

    it('preserves the original source and stays clean when opened or modes are switched', async () => {
        const markdown = '\n# Heading\n\n[first][doc]\n\n[doc]: <https://example.com>\n\n';
        const { handle, onChange, onDirtyChange } = renderEditor(markdown);
        expect(handle.current?.getMarkdown()).toBe(markdown);
        await selectMode('Source');
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        await selectMode('Rich text');
        act(() => handle.current?.flush());
        expect(handle.current?.getMarkdown()).toBe(markdown);
        expect(onChange).not.toHaveBeenCalled();
        expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    });

    it('keeps untouched source clean when nested table and code editors finish loading', async () => {
        const markdown = '# Title\n\n- [x] Task\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst value = 1;\n```\n\n[one][doc]\n\n[doc]: <https://example.com>\n';
        const { handle, onChange } = renderEditor(markdown);
        await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
        await selectMode('Source');
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        await selectMode('Rich text');
        act(() => handle.current?.flush());
        expect(handle.current?.getMarkdown()).toBe(markdown);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('saves Source edits verbatim and renders them after returning to Rich text', async () => {
        const { handle, onChange } = renderEditor('Original');
        await selectMode('Source');
        const changed = 'first  \nsecond\n\n[one][doc]\n\n[doc]: https://example.com\n';
        replaceSource(changed);
        await selectMode('Rich text');
        expect(screen.getByRole('link', { name: 'one' })).toHaveAttribute('href', 'https://example.com');
        act(() => handle.current?.flush());
        expect(onChange).toHaveBeenCalledWith(changed);
        expect(handle.current?.getMarkdown()).toBe(changed);
    });

    it('honors an explicitly requested initial Source view', () => {
        const draft = new MarkdownDraft('Initial Source');
        render(<AppThemeProvider><MarkdownEditor draft={draft} viewMode="source" /></AppThemeProvider>);
        expect(sourceEditor().state.doc.toString()).toBe('Initial Source');
        expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');
        expect(draft.getSnapshot()).toBe('Initial Source');
    });

    it('preserves the whole document when unsupported content is pasted into Rich text', async () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle } = renderEditor('Existing document');
        act(() => richEditor().update(() => $getRoot().selectEnd(), { discrete: true }));
        const event = new Event('paste', { cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
            value: {
                items: [{ kind: 'string', type: 'text/plain' }],
                getData: (type: string) => type === 'text/plain' ? '<div>New HTML</div>' : '',
            },
        });
        act(() => richEditor().dispatchCommand(PASTE_COMMAND, event as ClipboardEvent));
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('This content needs Source mode') }),
            { fallbackMessage: 'Clipboard content could not be pasted' });
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toBe('Existing document'));
        expect(handle.current?.getMarkdown()).toBe('Existing document');
        expect(event.defaultPrevented).toBe(true);
        expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('rejects unsupported rich insertion requests without overwriting a compact draft', async () => {
        const draft = new MarkdownDraft('Existing draft');
        render(<AppThemeProvider><MarkdownEditor draft={draft} hideToolbar /></AppThemeProvider>);
        await act(async () => {
            await expect(draft.requestInsertion('<div>New HTML</div>')).rejects.toThrow('The existing document is preserved');
        });
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toBe('Existing draft'));
        expect(draft.getSnapshot()).toBe('Existing draft');
        await act(async () => draft.requestInsertion('<div>New HTML</div>'));
        expect(draft.getSnapshot()).toContain('Existing draft');
        expect(draft.getSnapshot()).toContain('<div>New HTML</div>');
    });

    it('uses Source undo and redo without changing the hidden rich editor', async () => {
        const { handle } = renderEditor('Original');
        await selectMode('Source');
        replaceSource('Changed');
        await userEvent.click(screen.getByRole('button', { name: 'Undo Source edit' }));
        expect(handle.current?.getMarkdown()).toBe('Original');
        await userEvent.click(screen.getByRole('button', { name: 'Redo Source edit' }));
        expect(handle.current?.getMarkdown()).toBe('Changed');
        expect(document.querySelector('.mdxeditor-content')?.textContent).toBe('Original');
        expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
    });

    it('retains rich undo when Source was only viewed', async () => {
        const { handle } = renderEditor('Original');
        appendRichParagraph('First edit');
        appendRichParagraph();
        await selectMode('Source');
        await selectMode('Rich text');
        act(() => richEditor().dispatchCommand(UNDO_COMMAND, undefined));
        await waitFor(() => expect(handle.current?.getMarkdown()).not.toContain('Unrelated edit'));
    });

    it('rebases rich undo after Source changes so stale content cannot return', async () => {
        const { handle } = renderEditor('Original');
        appendRichParagraph();
        await selectMode('Source');
        replaceSource('Source replaces the document');
        await selectMode('Rich text');
        act(() => richEditor().dispatchCommand(UNDO_COMMAND, undefined));
        expect(handle.current?.getMarkdown()).toBe('Source replaces the document');
        expect(document.querySelector('.mdxeditor-content')?.textContent).toBe('Source replaces the document');
    });

    it('inserts service-requested Markdown at the Source caret and retains draft ownership', async () => {
        const draft = new MarkdownDraft('Before after');
        render(<AppThemeProvider><MarkdownEditor draft={draft} /></AppThemeProvider>);
        await selectMode('Source');
        act(() => sourceEditor().dispatch({ selection: { anchor: 7 } }));
        await act(async () => draft.requestInsertion('**inserted** '));
        expect(sourceEditor().state.doc.toString()).toBe('Before **inserted** after');
        expect(draft.getSnapshot()).toBe('Before **inserted** after');
    });

    it('resets Source text and undo when an external replacement arrives', async () => {
        const { handle } = renderEditor('[old][doc]\n\n[doc]: https://old.example');
        await selectMode('Source');
        replaceSource('Old unsaved edit');
        act(() => handle.current?.setMarkdown('[new][doc]\n\n[doc]: https://new.example'));
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toContain('https://new.example'));
        expect(screen.getByRole('button', { name: 'Undo Source edit' })).toBeDisabled();
        await selectMode('Rich text');
        expect(screen.getByRole('link', { name: 'new' })).toHaveAttribute('href', 'https://new.example');
        appendRichParagraph();
        expect(handle.current?.getMarkdown()).not.toContain('old.example');
    });

    it('switches documents in Source without carrying undo or reference definitions across them', async () => {
        const source = new MarkdownReliabilityDataSourceFixture();
        const alpha = source.addDocument('[alpha][doc]\n\n[doc]: https://alpha.example');
        const beta = source.addDocument('[beta][doc]\n\n[doc]: https://beta.example');
        source.setActiveTarget('list-card', alpha);
        const historyStore = new MarkdownDocumentHistoryStore();
        render(<AppThemeProvider><MarkdownEditor binding="list-card" dataSource={source} historyStore={historyStore} /></AppThemeProvider>);
        await selectMode('Source');
        replaceSource('[alpha edited][doc]\n\n[doc]: https://alpha.example');
        act(() => source.setActiveTarget('list-card', beta));
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toContain('https://beta.example'));
        expect(screen.getByRole('button', { name: 'Undo Source edit' })).toBeDisabled();
        await selectMode('Rich text');
        expect(screen.getByRole('link', { name: 'beta' })).toHaveAttribute('href', 'https://beta.example');
        appendRichParagraph();
        expect(source.getMarkdown(beta)).not.toContain('alpha.example');
        act(() => source.setActiveTarget('list-card', alpha));
        await waitFor(() => expect(screen.getByRole('link', { name: 'alpha edited' })).toHaveAttribute('href', 'https://alpha.example'));
        act(() => richEditor().dispatchCommand(UNDO_COMMAND, undefined));
        expect(document.querySelector('.mdxeditor-content')?.textContent).not.toContain('beta');
    });

    it.each(['<!-- preserve this comment -->\n\nText', '<div>preserve this HTML</div>'])('recovers unsupported HTML in Source: %s', async (markdown) => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle, onChange } = renderEditor(markdown, false, true);
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toBe(markdown));
        expect(screen.getByText(/Its source is preserved/u)).toBeInTheDocument();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Rich text is unavailable; edit this document in Source' });
        act(() => handle.current?.flush());
        expect(onChange).not.toHaveBeenCalled();
        replaceSource('Repaired Markdown');
        await selectMode('Rich text');
        await waitFor(() => expect(document.querySelector('.mdxeditor-content')?.textContent).toBe('Repaired Markdown'));
    });

    it('provides read-only Source recovery without permitting edits', async () => {
        const markdown = '<div>Read-only preview</div>';
        const { handle } = renderEditor(markdown, true, true);
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toBe(markdown));
        expect(sourceEditor().state.facet(EditorState.readOnly)).toBe(true);
        expect(handle.current?.getMarkdown()).toBe(markdown);
    });

    it('pastes Markdown into Source as raw text', async () => {
        const { handle } = renderEditor('Original');
        await selectMode('Source');
        act(() => sourceEditor().dispatch({ selection: { anchor: 0, head: 8 } }));
        fireEvent.paste(sourceEditor().contentDOM, { clipboardData: { items: [], getData: (type: string) => type === 'text/markdown' ? '**raw**' : '' } });
        expect(handle.current?.getMarkdown()).toBe('**raw**');
    });

    it('pastes an image through the attachment boundary into the Source caret', async () => {
        const draft = new MarkdownDraft('Before after');
        const imagePasteHandler = vi.fn(async (file: File, insert: (markdown: string) => void) => insert(`![${file.name}](saved.png) `));
        render(<AppThemeProvider><MarkdownEditor draft={draft} imagePasteHandler={imagePasteHandler} /></AppThemeProvider>);
        await selectMode('Source');
        act(() => sourceEditor().dispatch({ selection: { anchor: 7 } }));
        const image = new File(['pixels'], 'image.png', { type: 'image/png' });
        fireEvent.paste(sourceEditor().contentDOM, {clipboardData: {items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }], getData: () => 'fallback text'}});
        await waitFor(() => expect(draft.getSnapshot()).toBe('Before ![image.png](saved.png) after'));
        expect(imagePasteHandler).toHaveBeenCalledWith(image, expect.any(Function));
    });

    it('drops attachments through the shared workflow into the Source caret', async () => {
        const draft = new MarkdownDraft('Before after');
        const attachmentHandler = vi.fn(async ([file]: File[], insert: (markdown: string) => void) => insert(`[${file.name}](saved.txt) `));
        render(<AppThemeProvider><MarkdownEditor attachmentHandler={attachmentHandler} draft={draft} /></AppThemeProvider>);
        await selectMode('Source');
        act(() => sourceEditor().dispatch({ selection: { anchor: 7 } }));
        const file = new File(['content'], 'file.txt', { type: 'text/plain' });
        fireEvent.drop(sourceEditor().contentDOM, { dataTransfer: { files: [file], types: ['Files'] } });
        await waitFor(() => expect(draft.getSnapshot()).toBe('Before [file.txt](saved.txt) after'));
        expect(attachmentHandler).toHaveBeenCalledWith([file], expect.any(Function));
    });
});
