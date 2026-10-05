import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import {
    codeBlockEditorDescriptors$, defaultCodeBlockLanguage$, directiveDescriptors$, importMdastTreeToLexical, importVisitors$,
    jsxComponentDescriptors$, UnrecognizedMarkdownConstructError, usedLexicalNodes$,
    markdown$, markdownProcessingError$, markdownSourceEditorValue$, muteChange$, rootEditor$, setMarkdown$, viewMode$,
} from '@mdxeditor/editor';
import type { Realm } from '@mdxeditor/gurx';
import { $getRoot, CLEAR_HISTORY_COMMAND, createEditor } from 'lexical';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { dialogService } from '../../../services/dialog_service';
import type { MarkdownDocumentTarget } from '../data_sources/markdown_data_source';
import type { MarkdownDocumentHistoryStore } from '../history/markdown_document_history_store';
import type { MarkdownImagePasteHandler } from '../paste/markdown_paste_cell';
import { markdownSourceCanRedo$, markdownSourceCanUndo$ } from './markdown_source_cell';
import { MarkdownSourceEditorBridge } from './markdown_source_editor_bridge';

export interface MarkdownSourceConfig {
    compact: boolean;
    initialViewMode: 'rich-text' | 'source';
    getMarkdown(): string;
    getTarget(): MarkdownDocumentTarget | null;
    historyStore?: MarkdownDocumentHistoryStore;
    imagePasteHandler?: MarkdownImagePasteHandler;
    onReady(controller: MarkdownSourceController): void;
    onRichTextBaseline(markdown: string): void;
}

/** Adapts Source commands to CodeMirror while existing document and draft services own the text. */
export class MarkdownSourceController {
    private sourceEditor: EditorView | null = null;
    private transitionToken = 0;
    private shiftedPaste = false;
    private readonly realm: Realm;
    config: MarkdownSourceConfig;
    transitioning = false;

    constructor(realm: Realm, config: MarkdownSourceConfig) {
        this.realm = realm;
        this.config = config;
    }

    get sourceActive() { return this.realm.getValue(viewMode$) === 'source'; }

    sourceExtensions() {
        return [ViewPlugin.define(this.createBridge), EditorView.updateListener.of(this.handleSourceUpdate),
            EditorView.domEventHandlers({ keydown: this.handleKeyDown, paste: this.handlePaste })];
    }

    private createBridge = (editor: EditorView) => new MarkdownSourceEditorBridge(editor, this);

    attachSource(editor: EditorView) {
        this.sourceEditor = editor;
        this.syncHistoryAvailability();
    }

    detachSource(editor: EditorView) {
        if (this.sourceEditor === editor) this.sourceEditor = null;
        this.syncHistoryAvailability();
    }

    private handleSourceUpdate = () => { this.syncHistoryAvailability(); };

    private syncHistoryAvailability() {
        const editor = this.sourceEditor;
        this.realm.pubIn({
            [markdownSourceCanUndo$]: !!editor && undoDepth(editor.state) > 0,
            [markdownSourceCanRedo$]: !!editor && redoDepth(editor.state) > 0,
        });
    }

    insertMarkdown(markdown: string) {
        const editor = this.sourceEditor;
        if (!editor) throw new Error('Markdown Source editor is not mounted');
        if (editor.state.facet(EditorState.readOnly)) return;
        editor.dispatch(editor.state.replaceSelection(markdown), { scrollIntoView: true, userEvent: 'input' });
        editor.focus();
    }

    /** Preflights CommonMark constructs before MDXEditor's fragment importer can replace its document error source. */
    validateRichInsertion(markdown: string) {
        const editor = createEditor({ nodes: this.realm.getValue(usedLexicalNodes$), onError: (error) => { throw error; } });
        try {
            editor.update(() => importMdastTreeToLexical({
                root: $getRoot(),
                mdastRoot: fromMarkdown(markdown),
                visitors: this.realm.getValue(importVisitors$),
                jsxComponentDescriptors: this.realm.getValue(jsxComponentDescriptors$),
                directiveDescriptors: this.realm.getValue(directiveDescriptors$),
                codeBlockEditorDescriptors: this.realm.getValue(codeBlockEditorDescriptors$),
                defaultCodeBlockLanguage: this.realm.getValue(defaultCodeBlockLanguage$),
            }), { discrete: true });
        } catch (error) {
            if (!(error instanceof UnrecognizedMarkdownConstructError)) throw error;
            this.setMode('source');
            throw new Error('This content needs Source mode. The existing document is preserved; paste or insert it again in Source.');
        }
    }

    undo() { if (this.sourceEditor) undo(this.sourceEditor); }
    redo() { if (this.sourceEditor) redo(this.sourceEditor); }

    setMode(mode: 'rich-text' | 'source') {
        if (mode === 'source') {
            this.transitioning = true;
            this.realm.pub(muteChange$, true);
            this.realm.pub(markdown$, this.config.getMarkdown());
            this.realm.pub(viewMode$, mode);
            this.finishTransition(false);
            return;
        }
        const source = this.realm.getValue(markdownSourceEditorValue$);
        const sourceChanged = source !== this.realm.getValue(markdown$);
        if (!sourceChanged && this.realm.getValue(markdownProcessingError$)) return;
        this.transitioning = true;
        this.realm.pub(viewMode$, mode);
        this.finishTransition(sourceChanged);
    }

    replaceMarkdown(markdown: string) {
        this.transitioning = true;
        this.realm.pub(muteChange$, true);
        this.realm.pub(setMarkdown$, markdown);
        this.realm.pub(markdown$, markdown);
        this.finishTransition(false, markdown);
    }

    recover(source: string) {
        if (this.realm.getValue(markdownProcessingError$)?.source !== source) return;
        this.transitioning = true;
        this.realm.pub(muteChange$, true);
        this.realm.pub(markdown$, source);
        this.realm.pub(viewMode$, 'source');
        this.finishTransition(false, source);
    }

    private finishTransition(rebaseHistory: boolean, source?: string) {
        const token = ++this.transitionToken;
        const editor = this.realm.getValue(rootEditor$);
        if (!editor) return;
        editor.update(() => {}, { onUpdate: () => this.completeTransition(token, rebaseHistory, source) });
    }

    private completeTransition(token: number, rebaseHistory: boolean, source?: string) {
        if (token !== this.transitionToken) return;
        if (rebaseHistory || source !== undefined) this.config.onRichTextBaseline(this.realm.getValue(markdown$));
        if (source !== undefined) this.realm.pub(markdown$, source);
        if (rebaseHistory) {
            const target = this.config.getTarget();
            if (this.config.historyStore && target) this.config.historyStore.replaceDocument(target, this.config.getMarkdown());
            else this.realm.getValue(rootEditor$)?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
        }
        this.realm.pub(muteChange$, false);
        this.transitioning = false;
    }

    private handlePaste = (event: ClipboardEvent, editor: EditorView) => {
        const shifted = this.shiftedPaste;
        this.shiftedPaste = false;
        if (editor.state.facet(EditorState.readOnly)) return false;
        const data = event.clipboardData;
        if (!data) return false;
        const image = [...data.items].find(({ kind, type }) => kind === 'file' && type.startsWith('image/'))?.getAsFile();
        if (image && this.config.imagePasteHandler) {
            event.preventDefault();
            void this.pasteImage(image);
            return true;
        }
        const markdown = data.getData('text/markdown');
        if (!markdown || shifted) return false;
        event.preventDefault();
        this.insertMarkdown(markdown);
        return true;
    };

    private handleKeyDown = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            this.shiftedPaste = event.shiftKey;
            setTimeout(this.clearPasteIntent, 0);
        }
        return false;
    };

    private clearPasteIntent = () => { this.shiftedPaste = false; };

    private async pasteImage(image: File) {
        try {
            await this.config.imagePasteHandler?.(image, this.insertMarkdown.bind(this));
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Clipboard image could not be pasted' });
        }
    }
}
