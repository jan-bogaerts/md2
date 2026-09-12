import { useCallback, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import {
    actionAcknowledgementEvent,
    agentAcknowledgementService,
    PROJECT_ACKNOWLEDGEMENT_EVENT,
} from '../../services/agents/agent_acknowledgement_service'
import { cardAgentState } from '../../services/agents/card_agent_state'
import { dataService } from '../../services/data/data_service'
import { useActionContextCard } from './use_action_context_card'

/** Persisted agent state for one action in a card or project context. */
export function useContextActionAgentState(actionId: string, context: ActionContext) {
    const { card } = useActionContextCard(context)
    const cardInternalId = card?.header.internalId ?? context.cardInternalId
    const isProject = context.kind === 'project'
    const subscribe = useCallback((onStoreChange: () => void) => {
        const eventType = isProject
            ? PROJECT_ACKNOWLEDGEMENT_EVENT
            : cardInternalId
                ? actionAcknowledgementEvent(cardInternalId, actionId)
                : null
        if (!eventType) return () => undefined

        agentAcknowledgementService.addEventListener(eventType, onStoreChange)

        return () => agentAcknowledgementService.removeEventListener(eventType, onStoreChange)
    }, [actionId, cardInternalId, isProject])
    const getSnapshot = useCallback(() => {
        const conversations = isProject
            ? dataService.agents.getProjectAgentConversationsSnapshot()
            : cardInternalId
                ? dataService.agents.getAgentConversations(cardInternalId)
                : []

        return cardAgentState(conversations.filter((conversation) => conversation.actionId === actionId))
    }, [actionId, cardInternalId, isProject])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
