import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { $getRoot, $getSelection, getNearestEditorFromDOMNode } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownDraft } from '../../../services/markdown/markdown_draft'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardMarkdownEditor } from './new_card_markdown_editor'

afterEach(cleanup)

describe('NewCardMarkdownEditor placeholder typeahead', () => {
    it('opens above the dialog and replaces a filtered query while keeping its toolbar hidden', async () => {
        const draft = new MarkdownDraft('')
        const overlayContainer = document.createElement('div')
        const { container } = render(
            <AppThemeProvider>
                <div ref={(element) => element?.append(overlayContainer)} />
                <NewCardMarkdownEditor draft={draft} overlayContainer={overlayContainer} />
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
        draft.requestFlush()
        expect(draft.getSnapshot()).toBe('{{card-file}}')
        expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
    })
})
