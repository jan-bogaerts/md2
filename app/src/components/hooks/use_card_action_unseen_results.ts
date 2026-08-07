import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { latestUnseenConversation } from '../../services/agents/card_agent_state'
import { useActionContextCard } from './use_action_context_card'
import { cardConversations, useActionsUnseenKey } from './use_agent_acknowledgements'

/** Owns acknowledgement and conversation data for one card-scoped action leaf. */
export function useCardActionUnseenResults(
    actionIds: string[],
    context: ActionContext,
): AgentConversation[] {
    const { card } = useActionContextCard(context)
    const cardInternalId = card?.header.internalId ?? context.cardInternalId
    useActionsUnseenKey(cardInternalId, actionIds)
    const conversations = cardConversations(cardInternalId)

    return actionIds.flatMap((actionId) => {
        const conversation = latestUnseenConversation(conversations, actionId)

        return conversation ? [conversation] : []
    })
}
