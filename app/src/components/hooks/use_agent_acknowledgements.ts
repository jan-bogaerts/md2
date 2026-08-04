import { useCallback, useSyncExternalStore } from 'react'
import {
    agentAcknowledgementCheckpoint,
    agentAcknowledgementService,
} from '../../services/agents/agent_acknowledgement_service'

/** Subscribes a leaf owner to the acknowledgement checkpoint for one card. */
export function useAgentAcknowledgement(projectId: string | null, cardPath: string | null | undefined) {
    const subscribe = useCallback((onStoreChange: () => void) => (
        projectId && cardPath ? agentAcknowledgementService.subscribeCard(projectId, cardPath, onStoreChange) : () => undefined
    ), [cardPath, projectId])
    const getSnapshot = useCallback(() => (
        projectId && cardPath ? agentAcknowledgementCheckpoint(projectId, cardPath) : null
    ), [cardPath, projectId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
