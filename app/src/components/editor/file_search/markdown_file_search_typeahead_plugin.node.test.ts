import { describe, expect, it, vi } from 'vitest'
import { LinkNode, $isLinkNode } from '@lexical/link'
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, createEditor } from 'lexical'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { replaceFileSearchQuery } from './markdown_file_search_selection'

describe('replaceFileSearchQuery', () => {
    it('replaces the query, restores the caret, and closes the menu', () => {
        const closeMenu = vi.fn()
        const editor = createEditor({ nodes: [LinkNode] })

        editor.update(() => {
            const textNode = $createTextNode('@F_108')
            $getRoot().append($createParagraphNode().append(textNode))
            replaceFileSearchQuery(new MarkdownFileSearchOption('design/F_108.md'), textNode, closeMenu)
        }, { discrete: true })

        editor.getEditorState().read(() => {
            const paragraphNode = $getRoot().getFirstChild()
            if (!$isElementNode(paragraphNode)) throw new Error('Expected paragraph node')
            const linkNode = paragraphNode.getFirstChild()
            expect($isLinkNode(linkNode)).toBe(true)
            if (!$isLinkNode(linkNode)) throw new Error('Expected selected repository file to create a link node')

            expect(linkNode.getTextContent()).toBe('F_108.md')
            expect(linkNode.getURL()).toBe('design/F_108.md')
        })
        expect(closeMenu).toHaveBeenCalledOnce()
    })

    it('leaves the menu open when the query node is unavailable', () => {
        const closeMenu = vi.fn()

        replaceFileSearchQuery(new MarkdownFileSearchOption('design/F_108.md'), null, closeMenu)

        expect(closeMenu).not.toHaveBeenCalled()
    })
})
