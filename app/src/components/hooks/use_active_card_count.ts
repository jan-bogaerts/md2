import { useSyncExternalStore } from 'react'
import { dataService, type DataService } from '../../services/data/data_service'

/** Subscribes to active-card count without observing card contents or background files. */
export function useActiveCardCount(service: DataService = dataService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getState().snapshot?.activeCards.length ?? 0,
        () => service.getState().snapshot?.activeCards.length ?? 0,
    )
}
