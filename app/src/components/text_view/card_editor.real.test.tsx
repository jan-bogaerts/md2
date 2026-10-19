import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { $getRoot, $getSelection, getNearestEditorFromDOMNode } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import type { MarkdownDocumentTarget } from '../editor/data_sources/markdown_data_source'
import { cardMarkdownDataSource } from '../editor/data_sources/card_markdown_data_source'
import { CardEditor } from './card_editor'

describe('CardEditor blur', () => {
    const target = { document: { kind: 'card' } } as MarkdownDocumentTarget

    beforeEach(() => {
        cardMarkdownDataSource.setActiveTarget('list-card', target)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockReturnValue('')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(null)
    })

    afterEach(() => {
        cleanup()
        cardMarkdownDataSource.setActiveTarget('list-card', null)
        vi.restoreAllMocks()
    })

    it('commits the typed body when focus leaves the editor', async () => {
        const commit = vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        const { container } = render(
            <AppThemeProvider>
                <CardEditor cardTypes={[]} statusColors={new Map()} />
                <button type="button">Outside</button>
            </AppThemeProvider>,
        )
        const content = container.querySelector('.mdxeditor-content')
        if (!content) throw new Error('Expected rich-text card editor')
        const editor = getNearestEditorFromDOMNode(content)
        if (!editor) throw new Error('Expected Lexical editor')

        act(() => editor.getRootElement()?.focus())
        act(() => editor.update(() => {
            $getRoot().selectEnd()
            $getSelection()?.insertText('Typed body')
        }, { discrete: true }))
        await waitFor(() => expect(content).toHaveTextContent('Typed body'))
        act(() => screen.getByRole('button', { name: 'Outside' }).focus())

        expect(commit).toHaveBeenCalledWith('list-card', target, expect.stringContaining('Typed body'))
    })
})
