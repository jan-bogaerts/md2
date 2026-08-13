import {
    $createParagraphNode,
    $createRangeSelection,
    $createTextNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    createEditor,
    type LexicalEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'
import {
    findMarkdownTextMatch,
    getMarkdownSearchSeed,
    getMarkdownSearchSelectionEnd,
    selectMarkdownTextMatch,
} from './markdown_local_text_search'

function editorWithTextNodes(...texts: string[]) {
    const editor = createEditor()
    editor.update(() => {
        const paragraph = $createParagraphNode()
        const textNodes = texts.map((text, index) => {
            const textNode = $createTextNode(text)
            if (index % 2 === 1) textNode.toggleFormat('bold')
            return textNode
        })
        paragraph.append(...textNodes)
        $getRoot().append(paragraph)
    }, { discrete: true })

    return editor
}

function setTextSelection(editor: LexicalEditor, nodeIndex: number, start: number, end = start) {
    editor.update(() => {
        const node = $getRoot().getAllTextNodes()[nodeIndex]
        const selection = $createRangeSelection()
        selection.anchor.set(node.getKey(), start, 'text')
        selection.focus.set(node.getKey(), end, 'text')
        $setSelection(selection)
    }, { discrete: true })
}

function selectedText(editor: LexicalEditor) {
    return editor.getEditorState().read(() => {
        const selection = $getSelection()
        return $isRangeSelection(selection) ? selection.getTextContent() : ''
    })
}

describe('Markdown local text search', () => {
    it('finds case-insensitive and case-sensitive matches', () => {
        expect(findMarkdownTextMatch('Alpha alpha', 'ALPHA', 0, false)).toEqual({ end: 5, start: 0 })
        expect(findMarkdownTextMatch('Alpha alpha', 'ALPHA', 0, true)).toBeNull()
    })

    it('starts at the supplied offset and wraps once', () => {
        expect(findMarkdownTextMatch('one two one', 'one', 3, false)).toEqual({ end: 11, start: 8 })
        expect(findMarkdownTextMatch('one two one', 'one', 11, false)).toEqual({ end: 3, start: 0 })
    })

    it('returns no match for empty or missing terms', () => {
        expect(findMarkdownTextMatch('content', '', 0, false)).toBeNull()
        expect(findMarkdownTextMatch('content', 'missing', 0, false)).toBeNull()
    })

    it('maps and selects a match spanning adjacent Lexical text nodes', () => {
        const editor = editorWithTextNodes('cross', 'node boundary')

        selectMarkdownTextMatch(editor, 'ssnode', 0, false)

        expect(selectedText(editor)).toBe('ssnode')
    })

    it('reads selected visible text and its document-order end offset', () => {
        const editor = editorWithTextNodes('before ', 'selected', ' after')
        setTextSelection(editor, 1, 0, 8)

        expect(getMarkdownSearchSeed(editor)).toBe('selected')
        expect(getMarkdownSearchSelectionEnd(editor)).toBe(15)
    })

    it('leaves selection unchanged when term has no match', () => {
        const editor = editorWithTextNodes('unchanged')
        setTextSelection(editor, 0, 2, 5)

        selectMarkdownTextMatch(editor, 'missing', 5, false)

        expect(selectedText(editor)).toBe('cha')
    })
})
