import { useSyncExternalStore } from 'react'
import { projectAccessService, type ProjectAccessService } from '../../services/project/project_access_service'

export function useProjectReadOnly(service: ProjectAccessService = projectAccessService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
