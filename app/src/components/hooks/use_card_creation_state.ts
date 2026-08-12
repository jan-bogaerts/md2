import { useSyncExternalStore } from 'react'
import { projectSessionService, type ProjectSessionService } from '../../services/project/project_session_service'

export function useCardCreationState(service: ProjectSessionService = projectSessionService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('cardCreationChanged', onStoreChange)

            return () => service.removeEventListener('cardCreationChanged', onStoreChange)
        },
        () => service.getCardCreationSnapshot(),
        () => service.getCardCreationSnapshot(),
    )
}
