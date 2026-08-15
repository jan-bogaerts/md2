import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardMarkdownEditor } from './new_card_markdown_editor'

afterEach(cleanup)

describe('NewCardMarkdownEditor', () => {
    it('renders attachment control while formatting controls stay hidden', () => {
        render(
            <AppThemeProvider>
                <NewCardMarkdownEditor onDirtyChange={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Attach files' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
    })
})
