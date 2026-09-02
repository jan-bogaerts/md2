import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'

/**
 * Collapses the blank line Lexical inserts between top-level blocks, so a command line typed with
 * Enter reaches the runner with single newline separators.
 */
export function normalizePlainTextBlocks(text: string) {
    return text.replace(/\n{2,}/g, '\n')
}

/** Reads the editor content as the text the user sees, without Markdown serialization escapes. */
export function readPlainText(editor: LexicalEditor) {
    const text = editor.getEditorState().read(() => $getRoot().getTextContent())

    return normalizePlainTextBlocks(text)
}

/** Replaces the editor content with literal text; lines become line breaks, never Markdown blocks. */
export function writePlainText(editor: LexicalEditor, text: string) {
    editor.update(() => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        const lines = text.split('\n')
        for (const [index, line] of lines.entries()) {
            if (index > 0) paragraph.append($createLineBreakNode())
            if (line) paragraph.append($createTextNode(line))
        }
        root.append(paragraph)
    }, { discrete: true })
}
