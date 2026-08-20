import type { ActionContext } from '../../data/action_context'
import { useActionAgentState } from './use_agent_acknowledgements'
import { useActionContextCard } from './use_action_context_card'

/** Persisted agent state for one action in a card context. */
export function useCardActionAgentState(actionId: string, context: ActionContext) {
    const { card } = useActionContextCard(context)
    const cardInternalId = card?.header.internalId ?? context.cardInternalId

    return useActionAgentState(cardInternalId, actionId)
}
