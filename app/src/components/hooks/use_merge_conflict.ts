import { useSyncExternalStore } from 'react'
import {
    mergeConflictService,
    type MergeConflictService,
} from '../../services/project/merge_conflict_service'

/** Subscribe to stable active conflict session state. */
export function useMergeConflict(service: MergeConflictService = mergeConflictService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
