import { useCallback, useSyncExternalStore } from 'react'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'

/** Subscribes one leaf to aggregate acknowledgement changes for a card. */
export function useCardAcknowledgements(cardPath: string | null | undefined) {
    const subscribe = useCallback((onStoreChange: () => void) => (
        cardPath ? agentAcknowledgementService.subscribeCard(cardPath, onStoreChange) : () => undefined
    ), [cardPath])
    const getSnapshot = useCallback(() => (
        cardPath ? agentAcknowledgementService.cardRevision(cardPath) : 0
    ), [cardPath])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Subscribes one popup leaf to acknowledgement changes for its exact card action. */
export function useActionAcknowledgements(cardPath: string | null | undefined, actionId: string) {
    return useActionsAcknowledgements(cardPath, [actionId])
}

/** Subscribes one popup leaf to acknowledgement changes for supplied card actions. */
export function useActionsAcknowledgements(cardPath: string | null | undefined, actionIds: string[]) {
    const actionIdsKey = [...actionIds].sort().join('\u0000')
    const subscribe = useCallback((onStoreChange: () => void) => (
        cardPath
            ? actionIdsKey.split('\u0000').filter((actionId) => actionId.length > 0).reduce<Array<() => void>>(
                (unsubscribes, actionId) => [
                    ...unsubscribes,
                    agentAcknowledgementService.subscribeAction(cardPath, actionId, onStoreChange),
                ],
            [],
            )
            : []
    ), [actionIdsKey, cardPath])
    const getSnapshot = useCallback(() => (
        cardPath
            ? actionIdsKey.split('\u0000').map((actionId) => agentAcknowledgementService.actionRevision(cardPath, actionId)).join(':')
            : ''
    ), [actionIdsKey, cardPath])
    const subscribeAll = useCallback((onStoreChange: () => void) => {
        const unsubscribes = subscribe(onStoreChange)

        return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
    }, [subscribe])

    return useSyncExternalStore(subscribeAll, getSnapshot, getSnapshot)
}
