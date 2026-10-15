import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { $getRoot, $getSelection, getNearestEditorFromDOMNode } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import type { MarkdownDocumentTarget } from '../editor/data_sources/markdown_data_source'
import { cardMarkdownDataSource } from '../editor/data_sources/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/history/markdown_document_history_store'
import { CardBodyEditor } from './card_body_editor'

describe('CardBodyEditor placeholder typeahead', () => {
    const target = { document: { kind: 'card' } } as MarkdownDocumentTarget

    beforeEach(() => {
        cardMarkdownDataSource.setActiveTarget('board-card', target)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockReturnValue('')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(null)
    })

    afterEach(() => {
        cleanup()
        cardMarkdownDataSource.setActiveTarget('board-card', null)
        vi.restoreAllMocks()
    })

    it('opens above the card popup and replaces a filtered query while keeping its toolbar', async () => {
        const overlayContainer = document.createElement('div')
        const { container } = render(
            <AppThemeProvider>
                <div ref={(element) => element?.append(overlayContainer)} />
                <CardBodyEditor
                    cardTypes={DEFAULT_CARD_TYPES}
                    dataSource={cardMarkdownDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    isFullscreen={false}
                    onToggleFullscreen={vi.fn()}
                    overlayContainer={overlayContainer}
                    statusColors={new Map()}
                />
            </AppThemeProvider>,
        )
        const content = container.querySelector('.mdxeditor-content')
        if (!content) throw new Error('Expected rich-text card editor')
        const editor = getNearestEditorFromDOMNode(content)
        if (!editor) throw new Error('Expected Lexical editor')

        act(() => editor.getRootElement()?.focus())
        act(() => editor.update(() => {
            $getRoot().selectEnd()
            $getSelection()?.insertText('{{')
        }, { discrete: true }))

        const listbox = await screen.findByRole('listbox', { name: 'Available placeholders' })
        expect(within(listbox).getByRole('option', { name: /^\{\{card-file\}\}/u })).toBeInTheDocument()

        act(() => editor.update(() => $getSelection()?.insertText('card-f'), { discrete: true }))
        await waitFor(() => expect(within(listbox).getAllByRole('option')).toHaveLength(1))
        await userEvent.click(within(listbox).getByRole('option', { name: /^\{\{card-file\}\}/u }))

        await waitFor(() => expect(content).toHaveTextContent('{{card-file}}'))
        expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument()
    })
})

describe('CardBodyEditor blur', () => {
    const target = { document: { kind: 'card' } } as MarkdownDocumentTarget

    beforeEach(() => {
        cardMarkdownDataSource.setActiveTarget('board-card', target)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockReturnValue('')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(null)
    })

    afterEach(() => {
        cleanup()
        cardMarkdownDataSource.setActiveTarget('board-card', null)
        vi.restoreAllMocks()
    })

    it('commits the typed body when focus leaves the editor', async () => {
        const commit = vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        const { container } = render(
            <AppThemeProvider>
                <CardBodyEditor
                    cardTypes={DEFAULT_CARD_TYPES}
                    dataSource={cardMarkdownDataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    isFullscreen={false}
                    onToggleFullscreen={vi.fn()}
                    statusColors={new Map()}
                />
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

        expect(commit).toHaveBeenCalledWith('board-card', target, expect.stringContaining('Typed body'))
    })
})
