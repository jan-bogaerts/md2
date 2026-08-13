import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import * as mdxEditor from '@mdxeditor/editor'
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { MarkdownPlaceholderToolbarControl } from './markdown_placeholder_toolbar_control'

describe('MarkdownPlaceholderToolbarControl', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('inserts the selected placeholder and returns focus to the editor', () => {
        const activeEditor = { dispatchCommand: vi.fn(), focus: vi.fn() }
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue(activeEditor as never)
        render(<MarkdownPlaceholderToolbarControl placeholders={ACTION_PROMPT_PLACEHOLDERS} />)

        fireEvent.click(screen.getByRole('button', { name: 'Insert placeholder' }))
        const menu = screen.getByRole('menu')
        fireEvent.click(within(menu).getByRole('menuitem', { name: /this-card/u }))

        expect(activeEditor.dispatchCommand).toHaveBeenCalledExactlyOnceWith(
            CONTROLLED_TEXT_INSERTION_COMMAND,
            '{{this-card}}',
        )
        expect(activeEditor.focus).toHaveBeenCalledOnce()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('offers all folder placeholders without the removed root placeholder', () => {
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue({ dispatchCommand: vi.fn(), focus: vi.fn() } as never)
        render(<MarkdownPlaceholderToolbarControl placeholders={ACTION_PROMPT_PLACEHOLDERS} />)

        fireEvent.click(screen.getByRole('button', { name: 'Insert placeholder' }))

        const menu = within(screen.getByRole('menu'))
        expect(menu.getByRole('menuitem', { name: /active-cards-folder.*root-level Markdown cards.*dashboard/iu })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: /this-card.*alias of.*card-file/iu })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: /worktree-folder/u })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: /repository-folder/u })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: /project-folder/u })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: /releases-folder/u })).toBeInTheDocument()
        expect(menu.queryByRole('menuitem', { name: /rootProjectFolder/u })).not.toBeInTheDocument()
    })
})
