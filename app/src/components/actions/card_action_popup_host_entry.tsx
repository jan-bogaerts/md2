import type { AgentConversation } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import {
    agentAcknowledgementService,
    latestUnseenAgentResult,
} from '../../services/agents/agent_acknowledgement_service'
import {
    cardActionPopupService,
    type CardActionPopupEntry,
} from '../../services/actions/card_action_popup_service'
import { useAgentAcknowledgements } from '../hooks/use_agent_acknowledgements'
import { useProjectState } from '../hooks/use_project_state'
import { ActionPopup } from './action_popup'

interface CardActionPopupHostEntryProps {
    entry: CardActionPopupEntry
}

/** Renders one service-owned card action popup with isolated local controller state. */
export function CardActionPopupHostEntry({ entry }: CardActionPopupHostEntryProps) {
    useAgentAcknowledgements()
    const { snapshot } = useProjectState()
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
    const card = cards.find(({ header }) => header.internalId === entry.context.cardInternalId) ?? null
    const cardPath = card?.path ?? entry.context.file
    const conversations = card?.agentConversations ?? []
    const actionIds = [...new Set(conversations.flatMap(({ actionId }) => actionId ? [actionId] : []))]
    const unseenResultConversations = cardPath
        ? actionIds.flatMap((actionId) => {
            const conversation = latestUnseenAgentResult(entry.projectKey, cardPath, conversations, actionId)

            return conversation ? [conversation] : []
        })
        : []

    const handleClose = () => {
        cardActionPopupService.close(entry.id)
    }

    const handleConversationViewed = (conversation: AgentConversation) => {
        try {
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
            unseenResultConversations={unseenResultConversations}
        />
    )
}
