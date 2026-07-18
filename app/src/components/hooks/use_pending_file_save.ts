import { useCallback, useSyncExternalStore } from 'react'
import { dataService } from '../../services/data/data_service'

function subscribe(onStoreChange: () => void) {
    dataService.addEventListener('changed', onStoreChange)

    return () => dataService.removeEventListener('changed', onStoreChange)
}

/** Reports whether the commit batcher still owns a pending save for one file. */
export function usePendingFileSave(path: string | null) {
    const getSnapshot = useCallback(
        () => path ? dataService.hasPendingActionFile(path) : false,
        [path],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
