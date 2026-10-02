import { useCallback, useSyncExternalStore } from 'react'
import { activeScheduleService } from '../../services/actions/active_schedule_service'

/** Reads pending action schedule state for one target card. */
export function usePendingActionScheduleForCard(cardInternalId: string | null) {
    const subscribe = useCallback((listener: () => void) => cardInternalId
        ? activeScheduleService.subscribeCard(cardInternalId, listener)
        : () => undefined, [cardInternalId])
    const getSnapshot = useCallback(() => !!cardInternalId
        && activeScheduleService.hasPendingActionForCard(cardInternalId), [cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Reads pending action schedule state for one action on one target card. */
export function usePendingActionScheduleForCardAndAction(cardInternalId: string | undefined, actionId: string) {
    const subscribe = useCallback((listener: () => void) => cardInternalId
        ? activeScheduleService.subscribeCardAction(cardInternalId, actionId, listener)
        : () => undefined, [actionId, cardInternalId])
    const getSnapshot = useCallback(() => !!cardInternalId
        && activeScheduleService.hasPendingActionForCardAndAction(cardInternalId, actionId), [actionId, cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
