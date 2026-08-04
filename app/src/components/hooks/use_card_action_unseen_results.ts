import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { latestUnseenAgentResult } from '../../services/agents/agent_acknowledgement_service'
import { useActionContextCard } from './use_action_context_card'
import { useAgentAcknowledgement } from './use_agent_acknowledgements'

/** Owns acknowledgement and conversation data for one card-scoped action leaf. */
export function useCardActionUnseenResults(
    actionIds: string[],
    context: ActionContext,
    projectKey: string | null,
): AgentConversation[] {
    const { card, cardPath } = useActionContextCard(context)
    const conversations = card?.agentConversations ?? []
    useAgentAcknowledgement(projectKey, cardPath)

    if (!projectKey || !cardPath) return []

    return actionIds.flatMap((actionId) => {
        const conversation = latestUnseenAgentResult(projectKey, cardPath, conversations, actionId)

        return conversation ? [conversation] : []
    })
}
