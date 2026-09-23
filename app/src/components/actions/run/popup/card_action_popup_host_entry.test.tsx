import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CardActionPopupEntry } from '../../../../services/card_popup_service'
import { CardActionPopupHostEntry } from './card_action_popup_host_entry'

const actionPopup = vi.hoisted(() => vi.fn<(props: Record<string, unknown>) => null>(() => null))

vi.mock('./action_popup', () => ({ ActionPopup: actionPopup }))

describe('CardActionPopupHostEntry', () => {
    it('passes requested action and run identities to the action popup', () => {
        const anchorElement = document.createElement('button')
        const entry: CardActionPopupEntry = {
            anchorElement,
            context: { cardInternalId: 'card-1', kind: 'card', title: 'Feature one' },
            fallbackAnchorElement: document.createElement('span'),
            id: 'popup-1',
            kind: 'action',
            requestedActionId: 'review',
            requestedConversationPath: 'design/activity/card__card-1.json#conversation=conversation-1',
            requestedRunId: 'run-7',
        }

        render(<CardActionPopupHostEntry entry={entry} stackPosition={2} visible />)

        expect(actionPopup.mock.calls[0][0]).toMatchObject({
            initialActionId: 'review',
            initialConversationPath: 'design/activity/card__card-1.json#conversation=conversation-1',
            initialRunId: 'run-7',
            popupEntryId: 'popup-1',
            popupVisible: true,
            stackPosition: 2,
        })
    })
})
