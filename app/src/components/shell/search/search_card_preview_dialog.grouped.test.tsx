import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card, CardHeader } from '../../../data/data_types'
import type { SearchMatch } from '../../../services/search/search_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { SearchCardPreviewDialog } from './search_card_preview_dialog'

function previewMatch(): SearchMatch {
    const header: CardHeader = {
        affects: [], after: null, agentLogReferences: [], author: null, changedFiles: [], id: 'F-253',
        internalId: 'former-card', owner: null, policy: {}, references: [], status: 'released', title: 'Former card',
    }
    const card: Card = {
        agentConversationErrors: [], agentConversations: [], content: 'Selectable **body** text.', hasFrontmatter: true,
        header, isActive: false, path: 'design/releases/v1/F-253-former.md',
    }

    return { card, context: 'Former card', field: 'title', path: card.path, source: 'header', title: card.header.title }
}

function renderPreview(onClose = vi.fn()) {
    return {
        onClose,
        ...render(
            <AppThemeProvider>
                <SearchCardPreviewDialog match={previewMatch()} onClose={onClose} />
            </AppThemeProvider>,
        ),
    }
}

describe('SearchCardPreviewDialog', () => {
    it('shows card identity, title, path, and read-only body without editing controls', () => {
        renderPreview()

        expect(screen.getByText('F-253')).toBeInTheDocument()
        expect(screen.getByText('Former card')).toBeInTheDocument()
        expect(screen.getByText('design/releases/v1/F-253-former.md')).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveValue('Selectable **body** text.')
        expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
        expect(screen.queryByTestId('mdx-editor-toolbar')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /attach/iu })).not.toBeInTheDocument()
    })

    it('closes through Close', () => {
        const { onClose } = renderPreview()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes through Escape', () => {
        const { onClose } = renderPreview()

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes through backdrop', () => {
        const { onClose } = renderPreview()
        const dialog = screen.getByRole('dialog')
        const backdropElement = dialog.closest('.MuiDialog-root')?.querySelector('.MuiBackdrop-root')
        if (!backdropElement) throw new Error('Missing preview backdrop')
        fireEvent.mouseDown(backdropElement)
        fireEvent.click(backdropElement)

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
