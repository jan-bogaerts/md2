import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ProjectSnapshot } from '../../data/data_types'
import {
    agentAcknowledgementService,
    cardAcknowledgementEvent,
    PROJECT_ACKNOWLEDGEMENT_EVENT,
} from '../../services/agents/agent_acknowledgement_service'
import { dataService } from '../../services/data/data_service'

function cardInternalIdForContext(context: ActionContext, snapshot: ProjectSnapshot | null) {
    if (context.cardInternalId) return context.cardInternalId

    return [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
        .find(({ path }) => path === context.file)?.header.internalId ?? null
}

/** Live stored conversations for one active card or project action context. */
export function useActionVisibilityConversations(context: ActionContext) {
    const isProject = context.kind === 'project'
    const cardInternalId = cardInternalIdForContext(context, dataService.getState().snapshot)
    const subscribe = useCallback((listener: () => void) => {
        const eventType = isProject
            ? PROJECT_ACKNOWLEDGEMENT_EVENT
            : cardInternalId
                ? cardAcknowledgementEvent(cardInternalId)
                : null
        if (!eventType) return () => undefined

        agentAcknowledgementService.addEventListener(eventType, listener)

        return () => agentAcknowledgementService.removeEventListener(eventType, listener)
    }, [cardInternalId, isProject])
    const getConversations = useCallback(() => {
        if (isProject) return dataService.agents.getProjectAgentConversationsSnapshot()

        return cardInternalId ? dataService.agents.getAgentConversations(cardInternalId) : []
    }, [cardInternalId, isProject])
    const getSnapshot = useCallback(() => getConversations()
        .flatMap(({ actionId }) => actionId ? [actionId] : [])
        .sort()
        .join('\u0000'), [getConversations])

    const actionIdsKey = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return useMemo(() => actionIdsKey.length > 0
        ? actionIdsKey.split('\u0000').map((actionId) => ({ actionId }))
        : [], [actionIdsKey])
}
