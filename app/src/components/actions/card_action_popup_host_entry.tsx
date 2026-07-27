import type { AgentConversation } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import {
    cardActionPopupService,
    type CardActionPopupEntry,
} from '../../services/actions/card_action_popup_service'
import { ActionPopup } from './action_popup'

interface CardActionPopupHostEntryProps {
    entry: CardActionPopupEntry
}

/** Renders one service-owned card action popup with isolated local controller state. */
export function CardActionPopupHostEntry({ entry }: CardActionPopupHostEntryProps) {
    const handleClose = () => {
        cardActionPopupService.close(entry.id)
    }

    const handleConversationViewed = (conversation: AgentConversation) => {
        try {
            const cardPath = entry.context.file
            if (!cardPath) throw new Error('Cannot acknowledge a card conversation without a card path')

            agentAcknowledgementService.acknowledge(entry.projectKey, cardPath, [conversation])
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card conversation could not be acknowledged' })
        }
    }

    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement

    return (
        <ActionPopup
            anchorElement={anchorElement}
            context={entry.context}
            draggable
            onClose={handleClose}
            onConversationViewed={handleConversationViewed}
            unseenResultActionIds={entry.unseenResultActionIds}
        />
    )
}
