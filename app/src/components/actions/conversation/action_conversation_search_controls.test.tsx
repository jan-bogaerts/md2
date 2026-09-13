import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionConversationSearchButton } from './action_conversation_search_button'
import { ActionConversationSearchRow } from './action_conversation_search_row'
import { ActionConversationSearchService } from './action_conversation_search_service'

function SearchHarness({ service }: { service: ActionConversationSearchService }) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        service.handlePopupKeyDown(event)
    }

    return (
        <AppThemeProvider>
            <div data-testid="popup" onKeyDown={handleKeyDown}>
                <ActionConversationSearchButton service={service} />
                <ActionConversationSearchRow service={service} />
            </div>
        </AppThemeProvider>
    )
}

function mountTranscript(service: ActionConversationSearchService) {
    const viewport = document.createElement('div')
    viewport.setAttribute('aria-label', 'Conversation chat')
    viewport.innerHTML = '<p>Alpha <strong>beta</strong> alpha</p>'
    document.body.append(viewport)
    service.registerTranscript(viewport, 'conversation-1')

    return viewport
}

describe('conversation search controls', () => {
    beforeEach(() => {
        document.body.replaceChildren()
        window.getSelection()?.removeAllRanges()
        Element.prototype.scrollIntoView = vi.fn()
    })

    it('disables entry until a conversation transcript is mounted', () => {
        const service = new ActionConversationSearchService()
        render(<SearchHarness service={service} />)
        const button = screen.getByRole('button', { name: 'Find in conversation' })

        expect(button).toBeDisabled()
        act(() => {
            mountTranscript(service)
        })
        expect(button).toBeEnabled()
    })

    it('searches, reports count, changes case mode, and navigates accessibly', async () => {
        const user = userEvent.setup()
        const service = new ActionConversationSearchService()
        mountTranscript(service)
        render(<SearchHarness service={service} />)

        await user.click(screen.getByRole('button', { name: 'Find in conversation' }))
        const search = screen.getByRole('search', { name: 'Conversation search' })
        const field = within(search).getByRole('textbox', { name: 'Find in conversation' })
        expect(field).toHaveFocus()
        await user.type(field, 'alpha')
        await user.click(within(search).getByRole('button', { name: 'Search' }))

        expect(search).toHaveTextContent('2 results')
        expect(window.getSelection()?.toString()).toBe('Alpha')
        await user.click(within(search).getByRole('button', { name: 'Next result' }))
        expect(service.getActiveMatchIndex()).toBe(1)
        await user.click(within(search).getByRole('button', { name: 'Previous result' }))
        expect(service.getActiveMatchIndex()).toBe(0)
        await user.click(within(search).getByRole('button', { name: 'Match case' }))
        expect(search).toHaveTextContent('1 result')
        expect(within(search).getByRole('button', { name: 'Match case' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('handles popup-scoped Ctrl+F, F3, and Escape without intercepting outside content', () => {
        const service = new ActionConversationSearchService()
        mountTranscript(service)
        render(<SearchHarness service={service} />)
        const outside = document.body.appendChild(document.createElement('button'))
        outside.textContent = 'Outside popup'

        fireEvent.keyDown(outside, { ctrlKey: true, key: 'f' })
        expect(screen.queryByRole('search', { name: 'Conversation search' })).not.toBeInTheDocument()

        const popup = screen.getByTestId('popup')
        const ctrlFHandled = fireEvent.keyDown(popup, { ctrlKey: true, key: 'f' })
        expect(ctrlFHandled).toBe(false)
        expect(screen.getByRole('textbox', { name: 'Find in conversation' })).toHaveFocus()
        service.setDraftTerm('alpha')
        service.submitSearch()

        const f3Handled = fireEvent.keyDown(popup, { key: 'F3' })
        expect(f3Handled).toBe(false)
        expect(service.getActiveMatchIndex()).toBe(1)
        const escapeHandled = fireEvent.keyDown(popup, { key: 'Escape' })
        expect(escapeHandled).toBe(false)
        expect(screen.queryByRole('search', { name: 'Conversation search' })).not.toBeInTheDocument()
    })
})
