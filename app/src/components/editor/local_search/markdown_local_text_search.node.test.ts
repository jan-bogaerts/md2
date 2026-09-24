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
    findMarkdownTextMatches,
    getMarkdownSearchSeed,
    getMarkdownSearchSelectionEnd,
    getMarkdownSearchSelectionStart,
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
    it('enumerates ordered non-overlapping matches under the selected case mode', () => {
        expect(findMarkdownTextMatches('Alpha alpha alpha', 'ALPHA', false)).toEqual([
            { end: 5, start: 0 },
            { end: 11, start: 6 },
            { end: 17, start: 12 },
        ])
        expect(findMarkdownTextMatches('Alpha alpha', 'ALPHA', true)).toEqual([])
        expect(findMarkdownTextMatches('aaaa', 'aa', false)).toEqual([
            { end: 2, start: 0 },
            { end: 4, start: 2 },
        ])
    })

    it('finds next and previous matches with document-boundary wrap', () => {
        const matches = findMarkdownTextMatches('one two one', 'one', false)

        expect(findMarkdownTextMatch(matches, 3, 'next')).toEqual({ end: 11, start: 8 })
        expect(findMarkdownTextMatch(matches, 11, 'next')).toEqual({ end: 3, start: 0 })
        expect(findMarkdownTextMatch(matches, 8, 'previous')).toEqual({ end: 3, start: 0 })
        expect(findMarkdownTextMatch(matches, 0, 'previous')).toEqual({ end: 11, start: 8 })
    })

    it('returns no match for empty or missing terms', () => {
        expect(findMarkdownTextMatches('content', '', false)).toEqual([])
        expect(findMarkdownTextMatches('content', 'missing', false)).toEqual([])
        expect(findMarkdownTextMatch([], 0, 'next')).toBeNull()
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
        expect(getMarkdownSearchSelectionStart(editor)).toBe(7)
        expect(getMarkdownSearchSelectionEnd(editor)).toBe(15)
    })

    it('leaves selection unchanged when term has no match', () => {
        const editor = editorWithTextNodes('unchanged')
        setTextSelection(editor, 0, 2, 5)

        const result = selectMarkdownTextMatch(editor, 'missing', 5, false)

        expect(selectedText(editor)).toBe('cha')
        expect(result).toEqual({ count: 0, match: null })
    })

    it('selects previous match across adjacent nodes and reports whole-document count', () => {
        const editor = editorWithTextNodes('one cr', 'oss one')

        const result = selectMarkdownTextMatch(editor, 'one', 0, false, 'previous')

        expect(selectedText(editor)).toBe('one')
        expect(result).toEqual({ count: 2, match: { end: 13, start: 10 } })
    })

    it('recomputes matches from current document text for later navigation', () => {
        const editor = editorWithTextNodes('one one')
        expect(selectMarkdownTextMatch(editor, 'one', 0, false).count).toBe(2)
        editor.update(() => {
            $getRoot().getAllTextNodes()[0].setTextContent('one one one')
        }, { discrete: true })

        const result = selectMarkdownTextMatch(editor, 'one', 3, false)

        expect(result).toEqual({ count: 3, match: { end: 7, start: 4 } })
    })
})
