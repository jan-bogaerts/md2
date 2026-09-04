import { useCallback, useSyncExternalStore } from 'react'
import {
    actionAcknowledgementEvent,
    agentAcknowledgementService,
    cardAcknowledgementEvent,
    PROJECT_ACKNOWLEDGEMENT_EVENT,
} from '../../services/agents/agent_acknowledgement_service'
import { cardAgentState, latestUnseenConversation } from '../../services/agents/card_agent_state'
import { dataService } from '../../services/data/data_service'

function subscribeToAcknowledgements(eventTypes: string[], onStoreChange: () => void) {
    for (const eventType of eventTypes) agentAcknowledgementService.addEventListener(eventType, onStoreChange)

    return () => {
        for (const eventType of eventTypes) agentAcknowledgementService.removeEventListener(eventType, onStoreChange)
    }
}

/** Reads the live conversations of a card, which a rendered card copy cannot provide. */
export function cardConversations(cardInternalId: string | null | undefined) {
    return cardInternalId ? dataService.agents.getAgentConversations(cardInternalId) : []
}

/**
 * Agent state of one card, refreshed on that card's scoped conversation events.
 * Conversations are read from the agent store on every snapshot, so newly attached or
 * acknowledged conversations are picked up without republishing the card.
 */
export function useCardAgentState(cardInternalId: string | null | undefined) {
    const subscribe = useCallback((onStoreChange: () => void) => (
        cardInternalId
            ? subscribeToAcknowledgements([cardAcknowledgementEvent(cardInternalId)], onStoreChange)
            : () => undefined
    ), [cardInternalId])
    const getSnapshot = useCallback(() => cardAgentState(cardConversations(cardInternalId)), [cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Project agent state backed by project-origin conversations in AgentIntegration. */
export function useProjectAgentState() {
    const subscribe = useCallback((onStoreChange: () => void) => (
        subscribeToAcknowledgements([PROJECT_ACKNOWLEDGEMENT_EVENT], onStoreChange)
    ), [])
    const getSnapshot = useCallback(() => (
        cardAgentState(dataService.agents.getProjectAgentConversationsSnapshot())
    ), [])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Agent state of one card action, refreshed only by that action's scoped conversation event. */
export function useActionAgentState(cardInternalId: string | null | undefined, actionId: string) {
    const subscribe = useCallback((onStoreChange: () => void) => (
        cardInternalId
            ? subscribeToAcknowledgements([actionAcknowledgementEvent(cardInternalId, actionId)], onStoreChange)
            : () => undefined
    ), [actionId, cardInternalId])
    const getSnapshot = useCallback(() => cardAgentState(
        cardConversations(cardInternalId).filter((conversation) => conversation.actionId === actionId),
    ), [actionId, cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Identifies the unseen conversations of the given card actions, refreshed on their scoped events. */
export function useActionsUnseenKey(cardInternalId: string | null | undefined, actionIds: string[]) {
    const actionIdsKey = [...new Set(actionIds)].sort().join(',')
    const subscribe = useCallback((onStoreChange: () => void) => {
        if (!cardInternalId) return () => undefined
        const eventTypes = actionIdsKey.split(',')
            .filter((actionId) => actionId.length > 0)
            .map((actionId) => actionAcknowledgementEvent(cardInternalId, actionId))

        return subscribeToAcknowledgements(eventTypes, onStoreChange)
    }, [actionIdsKey, cardInternalId])
    const getSnapshot = useCallback(() => {
        const conversations = cardConversations(cardInternalId)

        return actionIdsKey.split(',')
            .map((actionId) => latestUnseenConversation(conversations, actionId)?.id ?? '')
            .join(',')
    }, [actionIdsKey, cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
