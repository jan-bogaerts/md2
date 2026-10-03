import type { EditorView } from '@codemirror/view';
import type { MarkdownSourceController } from './markdown_source_controller';

/** Keeps the command adapter attached to the current CodeMirror instance only. */
export class MarkdownSourceEditorBridge {
    private readonly editor: EditorView;
    private readonly controller: MarkdownSourceController;

    constructor(editor: EditorView, controller: MarkdownSourceController) {
        this.editor = editor;
        this.controller = controller;
        controller.attachSource(editor);
    }

    destroy() { this.controller.detachSource(this.editor); }
}
