import { useSyncExternalStore } from 'react'
import { projectSessionService, type ProjectSessionService } from '../../services/project_session_service'

export function useProjectSession(service: ProjectSessionService = projectSessionService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
