import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionConversationPinButton } from './action_conversation_pin_button'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { dataService } from '../../../services/data/data_service'

const conversation: ConversationPickerConversation = {
    actionId: 'review', cardInternalId: 'card-1', hasExplicitTitle: true, id: 'conversation-1',
    path: 'design/activity/card__card-1.json#conversation=conversation-1',
    startedAt: '2026-09-19T10:00:00.000Z', title: 'Review',
}

function renderButton(displayedConversation: ConversationPickerConversation | null, onToggle = vi.fn()) {
    render(
        <AppThemeProvider>
            <ActionConversationPinButton conversation={displayedConversation} disabled={false} onToggle={onToggle} />
        </AppThemeProvider>,
    )

    return onToggle
}

describe('ActionConversationPinButton', () => {
    afterEach(() => {
        cleanup()
        dataService.conversationPins.reset()
        vi.restoreAllMocks()
    })

    it('disables pinning for New conversation', () => {
        renderButton(null)

        expect(screen.getByRole('button', { name: 'Pin conversation' })).toBeDisabled()
    })

    it('toggles selected conversation with accessible pin and unpin labels', () => {
        const onToggle = renderButton(conversation)
        fireEvent.click(screen.getByRole('button', { name: 'Pin conversation' }))
        expect(onToggle).toHaveBeenCalledOnce()

        cleanup()
        vi.spyOn(dataService.conversationPins, 'isPinned').mockReturnValue(true)
        renderButton(conversation)
        expect(screen.getByRole('button', { name: 'Unpin conversation' })).toBeEnabled()
    })
})
