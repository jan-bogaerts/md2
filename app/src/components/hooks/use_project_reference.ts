import { useSyncExternalStore } from 'react'
import type { ProjectReference } from '../../data/data_types'
import { dataService, type DataService } from '../../services/data/data_service'

/** Subscribe only to current project reference. */
export function useProjectReference(service: DataService = dataService): ProjectReference | null {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getState().project,
        () => service.getState().project,
    )
}
