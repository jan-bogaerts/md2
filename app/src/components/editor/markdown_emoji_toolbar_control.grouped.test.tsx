import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as mdxEditor from '@mdxeditor/editor'
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownEmojiToolbarControl } from './markdown_emoji_toolbar_control'

function mockActiveEditor() {
    const activeEditor = { dispatchCommand: vi.fn(), focus: vi.fn() }
    vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue(activeEditor as never)
    return activeEditor
}

function openPicker() {
    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))
    return within(screen.getByRole('dialog', { name: 'Emoji picker' }))
}

describe('MarkdownEmojiToolbarControl', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('opens a picker with a search field and grouped emoji', () => {
        mockActiveEditor()
        render(<MarkdownEmojiToolbarControl />)

        const picker = openPicker()

        expect(picker.getByRole('textbox', { name: 'Search emoji' })).toBeInTheDocument()
        expect(picker.getByRole('heading', { name: 'Smileys & emotion' })).toBeInTheDocument()
        expect(picker.getByRole('heading', { name: 'Flags' })).toBeInTheDocument()
        expect(picker.getByRole('button', { name: 'grinning face' })).toHaveTextContent('😀')
    })

    it('filters case-insensitively by name and keyword and hides empty groups', () => {
        mockActiveEditor()
        render(<MarkdownEmojiToolbarControl />)
        const picker = openPicker()

        fireEvent.change(picker.getByRole('textbox', { name: 'Search emoji' }), { target: { value: 'THUMBS' } })

        expect(picker.getByRole('button', { name: 'thumbs up' })).toBeInTheDocument()
        expect(picker.getByRole('button', { name: 'thumbs down' })).toBeInTheDocument()
        expect(picker.queryByRole('button', { name: 'grinning face' })).not.toBeInTheDocument()
        expect(picker.getByRole('heading', { name: 'People & body' })).toBeInTheDocument()
        expect(picker.queryByRole('heading', { name: 'Smileys & emotion' })).not.toBeInTheDocument()

        fireEvent.change(picker.getByRole('textbox', { name: 'Search emoji' }), { target: { value: 'Programmer' } })

        expect(picker.getByRole('button', { name: 'technologist' })).toHaveTextContent('🧑‍💻')
    })

    it('shows an empty state when no emoji matches the filter', () => {
        mockActiveEditor()
        render(<MarkdownEmojiToolbarControl />)
        const picker = openPicker()

        fireEvent.change(picker.getByRole('textbox', { name: 'Search emoji' }), { target: { value: 'no-such-emoji-xyz' } })

        expect(picker.getByText('No emoji found')).toBeInTheDocument()
        expect(picker.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('inserts the literal emoji character, returns focus to the editor and closes', async () => {
        const activeEditor = mockActiveEditor()
        render(<MarkdownEmojiToolbarControl />)
        const picker = openPicker()

        fireEvent.click(picker.getByRole('button', { name: 'thumbs up' }))

        expect(activeEditor.dispatchCommand).toHaveBeenCalledExactlyOnceWith(CONTROLLED_TEXT_INSERTION_COMMAND, '👍')
        expect(activeEditor.focus).toHaveBeenCalledOnce()
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).not.toBeInTheDocument())
    })

    it('disables the button while no editor is active', () => {
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue(null as never)
        render(<MarkdownEmojiToolbarControl />)

        expect(screen.getByRole('button', { name: 'Insert emoji' })).toBeDisabled()
    })

    it('renders the picker inside the provided overlay container', () => {
        mockActiveEditor()
        const overlayContainer = document.createElement('div')
        document.body.appendChild(overlayContainer)
        render(<MarkdownEmojiToolbarControl overlayContainer={overlayContainer} />)

        openPicker()

        expect(overlayContainer).toContainElement(screen.getByRole('dialog', { name: 'Emoji picker' }))
        overlayContainer.remove()
    })
})
