import { MDXEditor } from '@mdxeditor/editor'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode, type LexicalEditor } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { markdownPlaceholderPlugin } from './markdown_placeholder_realm_plugin'

const CARET_LEFT = 150
const CARET_TOP = 200
const CARET_HEIGHT = 18
const CARET_RECT = new DOMRect(CARET_LEFT, CARET_TOP, 2, CARET_HEIGHT)
const CONTAINER_OFFSET = 400
const VIEWPORT_WIDTH = 1280
const VIEWPORT_HEIGHT = 800

function renderTypeaheadEditor() {
    const plugins = [markdownPlaceholderPlugin({ placeholders: ACTION_PROMPT_PLACEHOLDERS })]
    const { container } = render(
        <AppThemeProvider>
            <MDXEditor markdown="" plugins={plugins} />
        </AppThemeProvider>,
    )
    const content = container.querySelector('.mdxeditor-root-contenteditable [contenteditable="true"]')
    if (!content) throw new Error('Expected rich-text editor')
    const editor = getNearestEditorFromDOMNode(content)
    if (!editor) throw new Error('Expected Lexical editor')

    return { content, editor }
}

async function insertPlaceholder(editor: LexicalEditor, optionName: RegExp) {
    act(() => editor.getRootElement()?.focus())
    act(() => editor.update(() => {
        $getRoot().selectEnd()
        $getSelection()?.insertText('{{')
    }, { discrete: true }))

    const listbox = await screen.findByRole('listbox', { name: 'Available placeholders' })
    await userEvent.click(within(listbox).getByRole('option', { name: optionName }))
}

describe('MarkdownPlaceholderTypeaheadPlugin', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('positions the menu at the caret when the editor sits inside an offset container', async () => {
        vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(CARET_RECT)
        vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(VIEWPORT_WIDTH)
        vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(VIEWPORT_HEIGHT)
        const overlayContainer = document.createElement('div')
        const plugins = [markdownPlaceholderPlugin({ overlayContainer, placeholders: ACTION_PROMPT_PLACEHOLDERS })]
        const containerStyle = { left: CONTAINER_OFFSET, position: 'absolute', top: CONTAINER_OFFSET, transform: 'translateX(0)' } as const
        const { container } = render(
            <AppThemeProvider>
                <div style={containerStyle}>
                    <div ref={(element) => element?.append(overlayContainer)} />
                    <MDXEditor markdown="" plugins={plugins} />
                </div>
            </AppThemeProvider>,
        )
        const content = container.querySelector('.mdxeditor-root-contenteditable [contenteditable="true"]')
        if (!content) throw new Error('Expected rich-text editor')
        const editor = getNearestEditorFromDOMNode(content)
        if (!editor) throw new Error('Expected Lexical editor')

        act(() => editor.getRootElement()?.focus())
        act(() => editor.update(() => {
            $getRoot().selectEnd()
            $getSelection()?.insertText('{{')
        }, { discrete: true }))

        const listbox = await screen.findByRole('listbox', { name: 'Available placeholders' })
        const menuLayer = listbox.closest('.MuiPopper-root')
        if (!(menuLayer instanceof HTMLElement)) throw new Error('Missing placeholder menu layer')

        expect(overlayContainer).not.toContainElement(listbox)
        expect(menuLayer.parentElement).toBe(document.body)
        await waitFor(() => expect(menuLayer.style.transform).toBe(`translate(${CARET_LEFT}px, ${CARET_TOP + CARET_HEIGHT}px)`))
    })

    it('selects path after inserting the data-path placeholder', async () => {
        const { content, editor } = renderTypeaheadEditor()

        await insertPlaceholder(editor, /^\{\{data path\}\}/u)

        await waitFor(() => expect(content).toHaveTextContent('{{data path}}'))
        const selection = editor.getEditorState().read(() => {
            const currentSelection = $getSelection()
            if (!$isRangeSelection(currentSelection)) throw new Error('Expected range selection')

            return {
                anchorOffset: currentSelection.anchor.offset,
                focusOffset: currentSelection.focus.offset,
                text: currentSelection.getTextContent(),
            }
        })
        expect(selection).toEqual({ anchorOffset: 7, focusOffset: 11, text: 'path' })
    })

    it('leaves the caret at the end after inserting the full-record placeholder', async () => {
        const { content, editor } = renderTypeaheadEditor()

        await insertPlaceholder(editor, /^\{\{data\}\}/u)

        await waitFor(() => expect(content).toHaveTextContent('{{data}}'))
        const selection = editor.getEditorState().read(() => {
            const currentSelection = $getSelection()
            if (!$isRangeSelection(currentSelection)) throw new Error('Expected range selection')

            return {
                anchorOffset: currentSelection.anchor.offset,
                focusOffset: currentSelection.focus.offset,
                text: currentSelection.getTextContent(),
            }
        })
        expect(selection).toEqual({ anchorOffset: 8, focusOffset: 8, text: '' })
    })
})
