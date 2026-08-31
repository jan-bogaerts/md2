import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardMarkdownEditor } from './new_card_markdown_editor'
import { MarkdownDraft } from '../../../services/markdown/markdown_draft'

afterEach(cleanup)

describe('NewCardMarkdownEditor', () => {
    it('suppresses toolbar controls while retaining attachment drops', () => {
        const draft = new MarkdownDraft('')
        render(
            <AppThemeProvider>
                <NewCardMarkdownEditor draft={draft} overlayContainer={null} />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
    })
})
