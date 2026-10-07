import { EditorView } from '@codemirror/view';
import { addImportVisitor$, realmPlugin, UnrecognizedMarkdownConstructError } from '@mdxeditor/editor';
import { LinkNode } from '@lexical/link';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    $createParagraphNode, $createTextNode, $getRoot, $isTextNode, $nodesOfType, COPY_COMMAND, PASTE_COMMAND, UNDO_COMMAND,
    getNearestEditorFromDOMNode, $getSelection, KEY_DOWN_COMMAND,
} from 'lexical';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownDraft } from '../../services/markdown/markdown_draft';
import { dialogService } from '../../services/dialog_service';
import { AppThemeProvider } from '../../theme/theme_provider';
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown_editor';
import { MarkdownDocumentHistoryStore } from './history/markdown_document_history_store';
import { MarkdownReliabilityDataSourceFixture } from './markdown_reliability_data_source_fixture';
import * as plainMarkdown from './plain_markdown_realm_plugin';
import { REPORTED_STACK_TRACE } from './markdown_stack_trace_fixture';

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

function pasteRich(markdown: string, mimeType = 'text/plain') {
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', {value: { items: [{ kind: 'string', type: mimeType }], getData: (type: string) => type === mimeType ? markdown : '' }});
    act(() => richEditor().dispatchCommand(PASTE_COMMAND, event as ClipboardEvent));
    return event;
}

function richText() {
    return richEditor().getEditorState().read(() => $getRoot().getTextContent());
}

function selectRichText(anchor: number, focus = anchor) {
    act(() => richEditor().getRootElement()?.focus());
    act(() => richEditor().update(() => {
        const text = $getRoot().getFirstDescendant();
        if (!$isTextNode(text)) throw new Error('Expected a text node for selection');
        text.select(anchor, focus);
    }, { discrete: true }));
}

/** Simulates a real visitor failure after earlier nodes have already imported. */
function failHtmlImport() {
    vi.spyOn(plainMarkdown, 'plainMarkdownPlugin').mockImplementation(realmPlugin({
        init(realm) {
            realm.pub(addImportVisitor$, {
                testNode: 'html',
                visitNode() { throw new UnrecognizedMarkdownConstructError('Injected HTML import failure'); },
            });
        },
    }));
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

    it.each(['Initial Source', '<div>Initial HTML</div>'])('honors an explicitly requested initial Source view: %s', (markdown) => {
        const draft = new MarkdownDraft(markdown);
        render(<AppThemeProvider><MarkdownEditor draft={draft} viewMode="source" /></AppThemeProvider>);
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');
        expect(draft.getSnapshot()).toBe(markdown);
    });

    it('inserts HTML once without leaving Rich text or losing the existing document', async () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle } = renderEditor('Existing document');
        act(() => richEditor().update(() => $getRoot().selectEnd(), { discrete: true }));
        const event = pasteRich('<div>New HTML</div>');
        expect(reportError).not.toHaveBeenCalled();
        await waitFor(() => expect(richText()).toContain('<div>New HTML</div>'));
        expect(richText()).toContain('Existing document');
        expect(richText().match(/New HTML/gu)).toHaveLength(1);
        expect(handle.current?.getMarkdown()).toContain('Existing document');
        expect(reportError).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('inserts HTML once into its owning compact draft', async () => {
        const draft = new MarkdownDraft('Existing draft');
        render(<AppThemeProvider><MarkdownEditor draft={draft} hideToolbar /></AppThemeProvider>);
        await act(async () => draft.requestInsertion('<div>New HTML</div>'));
        expect(draft.getSnapshot()).toContain('Existing draft');
        expect(richText()).toContain('<div>New HTML</div>');
        expect(richText().match(/New HTML/gu)).toHaveLength(1);
        expect(document.querySelector('.mdxeditor-source-editor')).not.toBeInTheDocument();
        draft.requestFlush();
        cleanup();
        renderEditor(draft.getSnapshot());
        expect(richText()).toContain('<div>New HTML</div>');
    });

    it.each(['text/plain', 'text/markdown'])('pastes the reported stack trace at a caret and survives saving/reopening: %s', async (mimeType) => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle, onChange } = renderEditor('Before after');
        selectRichText(7);
        pasteRich(REPORTED_STACK_TRACE, mimeType);
        const visibleTrace = REPORTED_STACK_TRACE.replace('&#x60;&#x60;&#x60;', '```').replace(/^ {4}/gmu, '');
        await waitFor(() => expect(richText()).toContain(visibleTrace));
        expect(richText()).toMatch(/^Before /u);
        expect(richText()).toMatch(/after$/u);
        expect(richText().match(/Uncaught Error Error: No fields to update/gu)).toHaveLength(1);
        await selectMode('Source');
        await selectMode('Rich text');
        appendRichParagraph();
        act(() => handle.current?.flush());
        const saved = handle.current?.getMarkdown() ?? '';
        expect(onChange).toHaveBeenCalledWith(saved);
        cleanup();
        renderEditor(saved);
        expect(richText()).toContain(visibleTrace);
        expect(richText()).toContain('Unrelated edit');
        expect(reportError).not.toHaveBeenCalled();
    });

    it.each(['text/plain', 'text/markdown'])('replaces only selected text with mixed Markdown and HTML: %s', async (mimeType) => {
        renderEditor('Before replace after');
        selectRichText(7, 14);
        pasteRich('**bold** <span>literal</span> <!-- comment -->', mimeType);
        await waitFor(() => expect(richText()).toBe('Before bold <span>literal</span> <!-- comment --> after'));
        expect(document.querySelector('.mdxeditor-content strong')).toHaveTextContent('bold');
        expect(document.querySelector('.mdxeditor-content span')?.textContent).not.toBe('literal');
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['text/plain', 'text/markdown'])('preserves multiline HTML in nested lists and quotes: %s', async (mimeType) => {
        const { handle } = renderEditor('Before');
        act(() => richEditor().update(() => $getRoot().selectEnd(), { discrete: true }));
        const markdown = '**bold**\n\n<section data-literal>\n**literal stars**\n<!-- comment -->\n</section>\n\n> - **nested**\n>\n>   <section data-literal>\n>   [literal](url)\n>   </section>';
        pasteRich(markdown, mimeType);
        await waitFor(() => expect(richText()).toContain('<section data-literal>\n**literal stars**\n<!-- comment -->\n</section>'));
        expect(document.querySelector('.mdxeditor-content blockquote li')).toHaveTextContent('[literal](url)');
        expect(document.querySelector('.mdxeditor-content section')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'literal' })).not.toBeInTheDocument();
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        cleanup();
        renderEditor(saved);
        expect(richText()).toContain('<section data-literal>\n**literal stars**\n<!-- comment -->\n</section>');
        expect(document.querySelector('.mdxeditor-content blockquote li')).toHaveTextContent('[literal](url)');
        expect(document.querySelector('.mdxeditor-content strong')).toHaveTextContent('bold');
        expect(document.querySelector('.mdxeditor-content section')).not.toBeInTheDocument();
    });

    it('imports external HTML replacements cleanly and retains later edits', async () => {
        const { handle, onChange, onDirtyChange } = renderEditor('Original');
        const markdown = '**bold** <span>replacement</span>\n\n<!-- keep -->';
        act(() => handle.current?.setMarkdown(markdown));
        await waitFor(() => expect(richText()).toContain('<span>replacement</span>'));
        act(() => handle.current?.flush());
        expect(handle.current?.getMarkdown()).toBe(markdown);
        expect(onChange).not.toHaveBeenCalled();
        expect(onDirtyChange).not.toHaveBeenCalledWith(true);
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        cleanup();
        renderEditor(saved);
        expect(richText()).toContain('<span>replacement</span>');
        expect(richText()).toContain('<!-- keep -->');
        expect(document.querySelector('.mdxeditor-content strong')).toHaveTextContent('bold');
    });

    it('imports Source HTML edits before later rich edits, saving and reopening', async () => {
        const { handle } = renderEditor('Original');
        await selectMode('Source');
        replaceSource('**bold** <span>source edit</span>\n\n<div>\n**literal**\n</div>');
        await selectMode('Rich text');
        appendRichParagraph();
        act(() => handle.current?.flush());
        const saved = handle.current?.getMarkdown() ?? '';
        cleanup();
        renderEditor(saved);
        expect(richText()).toContain('<span>source edit</span>');
        expect(richText()).toContain('<div>\n**literal**\n</div>');
        expect(richText()).toContain('Unrelated edit');
        expect(document.querySelector('.mdxeditor-content strong')).toHaveTextContent('bold');
    });

    it('keeps HTML image and formatting tags visible instead of creating elements or dropping tags', () => {
        const markdown = '**bold** <u>underlined</u> <code>literal</code> <sup>super</sup> <img src="raw.png" alt="raw">';
        const { handle } = renderEditor(markdown);
        expect(richText()).toBe(markdown.replace('**bold**', 'bold'));
        expect(document.querySelector('.mdxeditor-content img, .mdxeditor-content u, .mdxeditor-content code, .mdxeditor-content sup'))
            .not.toBeInTheDocument();
        appendRichParagraph();
        const saved = handle.current?.getMarkdown() ?? '';
        cleanup();
        renderEditor(saved);
        expect(richText()).toContain('<img src="raw.png" alt="raw">');
        expect(richText()).toContain('<u>underlined</u> <code>literal</code> <sup>super</sup>');
        expect(document.querySelector('.mdxeditor-content strong')).toHaveTextContent('bold');
    });

    it('keeps Ctrl+Shift+V as whole-fragment literal paste', async () => {
        renderEditor('Before');
        act(() => richEditor().update(() => $getRoot().selectEnd(), { discrete: true }));
        act(() => richEditor().dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true })));
        pasteRich('**literal** <span>text</span>');
        await waitFor(() => expect(richText()).toContain('**literal** <span>text</span>'));
        expect(document.querySelector('.mdxeditor-content strong')).not.toBeInTheDocument();
    });

    it('rejects genuine insertion failures without changing document, selection or mode', async () => {
        failHtmlImport();
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle } = renderEditor('Before selected after');
        selectRichText(7, 15);
        const selection = richEditor().getEditorState().read(() => $getSelection()?.clone());
        pasteRich('Partial paragraph\n\n<div>failure</div>');
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Injected HTML import failure' }),
            { fallbackMessage: 'Clipboard content could not be pasted' });
        expect(richText()).toBe('Before selected after');
        expect(handle.current?.getMarkdown()).toBe('Before selected after');
        expect(richEditor().getEditorState().read(() => $getSelection()?.is(selection ?? null))).toBe(true);
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
        await selectMode('Source');
        expect(sourceEditor().state.doc.toString()).toBe('Before selected after');
    });

    it('preserves complete failed opening source and offers manual recovery in a compact draft', async () => {
        failHtmlImport();
        const reportError = vi.spyOn(dialogService, 'error');
        const markdown = 'Partial paragraph\n\n<div>failure</div>\n\nLast paragraph';
        const draft = new MarkdownDraft(markdown);
        render(<AppThemeProvider><MarkdownEditor draft={draft} hideToolbar /></AppThemeProvider>);
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
        expect(document.querySelector('.mdxeditor-source-editor')).not.toBeInTheDocument();
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Injected HTML import failure' }),
            { fallbackMessage: 'Rich text conversion failed; complete source is preserved' });
        act(() => draft.requestFlush());
        expect(draft.getSnapshot()).toBe(markdown);
        await selectMode('Source');
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        replaceSource('**Repaired** document');
        await selectMode('Rich text');
        appendRichParagraph();
        expect(draft.getSnapshot()).toContain('**Repaired** document');
        expect(draft.getSnapshot()).not.toContain('Partial paragraph');
    });

    it('preserves Source edits and prior rich content when conversion genuinely fails', async () => {
        failHtmlImport();
        const draft = new MarkdownDraft('Original rich document');
        render(<AppThemeProvider><MarkdownEditor draft={draft} /></AppThemeProvider>);
        await selectMode('Source');
        const markdown = 'Partial paragraph\n\n<div>failure</div>\n\nLast paragraph';
        replaceSource(markdown);
        await selectMode('Rich text');
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        expect(richText()).toBe('Original rich document');
        act(() => draft.requestFlush());
        expect(draft.getSnapshot()).toBe(markdown);
        replaceSource('Repaired document');
        await selectMode('Rich text');
        expect(richText()).toBe('Repaired document');
    });

    it('rejects genuine draft insertion failures without replacing its owning draft', async () => {
        failHtmlImport();
        const draft = new MarkdownDraft('Existing draft');
        render(<AppThemeProvider><MarkdownEditor draft={draft} hideToolbar /></AppThemeProvider>);
        await act(async () => {
            await expect(draft.requestInsertion('Partial paragraph\n\n<div>failure</div>')).rejects.toThrow('Injected HTML import failure');
        });
        act(() => draft.requestFlush());
        expect(draft.getSnapshot()).toBe('Existing draft');
        expect(richText()).toBe('Existing draft');
        expect(document.querySelector('.mdxeditor-source-editor')).not.toBeInTheDocument();
    });

    it('preserves failed external replacement source until manual repair', async () => {
        failHtmlImport();
        const { handle, onChange } = renderEditor('Original rich document');
        const markdown = 'Partial paragraph\n\n<div>failure</div>\n\nLast paragraph';
        act(() => handle.current?.setMarkdown(markdown));
        expect(richText()).toBe('Original rich document');
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
        act(() => handle.current?.flush());
        expect(handle.current?.getMarkdown()).toBe(markdown);
        expect(onChange).not.toHaveBeenCalled();
        await selectMode('Source');
        expect(sourceEditor().state.doc.toString()).toBe(markdown);
        replaceSource('Repaired document');
        await selectMode('Rich text');
        expect(richText()).toBe('Repaired document');
    });

    it('retains complete failed external replacements while already in Source', async () => {
        failHtmlImport();
        const draft = new MarkdownDraft('Original document');
        render(<AppThemeProvider><MarkdownEditor draft={draft} /></AppThemeProvider>);
        await selectMode('Source');
        const markdown = 'Partial paragraph\n\n<div>failure</div>\n\nLast paragraph';
        act(() => draft.replace(markdown));
        await waitFor(() => expect(sourceEditor().state.doc.toString()).toBe(markdown));
        act(() => draft.requestFlush());
        expect(draft.getSnapshot()).toBe(markdown);
        expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');
        replaceSource('Repaired document');
        await selectMode('Rich text');
        expect(richText()).toBe('Repaired document');
    });

    it('validates and inserts tables and task lists with the live Markdown extensions', async () => {
        const draft = new MarkdownDraft('Before');
        render(<AppThemeProvider><MarkdownEditor draft={draft} /></AppThemeProvider>);
        await act(async () => draft.requestInsertion('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Task'));
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(document.querySelector('.mdxeditor-content li')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('pastes an image through the attachment boundary without leaving Rich text', async () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const draft = new MarkdownDraft('Before after');
        const imagePasteHandler = vi.fn(async (file: File, insert: (markdown: string) => void) => insert(`![${file.name}](${IMAGE}) `));
        render(<AppThemeProvider><MarkdownEditor draft={draft} imagePasteHandler={imagePasteHandler} /></AppThemeProvider>);
        selectRichText(7);
        const image = new File(['pixels'], 'image.png', { type: 'image/png' });
        fireEvent.paste(richEditor().getRootElement() as HTMLElement, {clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }], getData: () => '' }});
        expect(reportError).not.toHaveBeenCalled();
        expect(imagePasteHandler).toHaveBeenCalledOnce();
        await waitFor(() => expect(draft.getSnapshot()).toContain(`![image.png](${IMAGE})`));
        expect(draft.getSnapshot()).toContain('Before');
        expect(draft.getSnapshot()).toContain('after');
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('drops an attachment through the shared workflow without leaving Rich text', async () => {
        const draft = new MarkdownDraft('Before after');
        const attachmentHandler = vi.fn(async ([file]: File[], insert: (markdown: string) => void) => insert(`[${file.name}](saved.txt) `));
        render(<AppThemeProvider><MarkdownEditor attachmentHandler={attachmentHandler} draft={draft} /></AppThemeProvider>);
        selectRichText(7);
        const file = new File(['content'], 'file.txt', { type: 'text/plain' });
        fireEvent.drop(document.querySelector('.mdxeditor-content') as HTMLElement, { dataTransfer: { files: [file], types: ['Files'] } });
        await waitFor(() => expect(draft.getSnapshot()).toContain('[file.txt](saved.txt)'));
        expect(attachmentHandler).toHaveBeenCalledOnce();
        expect(screen.getByRole('link', { name: 'file.txt' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rich text' })).toHaveAttribute('aria-pressed', 'true');
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

    it.each(['<!-- preserve this comment -->\n\nText', '<div>preserve this HTML</div>'])('opens HTML cleanly in compact Rich text: %s', (markdown) => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { handle, onChange } = renderEditor(markdown, false, true);
        expect(richText().trimEnd()).toBe(markdown);
        expect(document.querySelector('.mdxeditor-source-editor')).not.toBeInTheDocument();
        expect(reportError).not.toHaveBeenCalled();
        act(() => handle.current?.flush());
        expect(onChange).not.toHaveBeenCalled();
        expect(handle.current?.getMarkdown()).toBe(markdown);
    });

    it('opens HTML in read-only compact Rich text without changing source', () => {
        const markdown = '<div>Read-only preview</div>';
        const { handle } = renderEditor(markdown, true, true);
        expect(richText().trimEnd()).toBe(markdown);
        expect(richEditor().isEditable()).toBe(false);
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
