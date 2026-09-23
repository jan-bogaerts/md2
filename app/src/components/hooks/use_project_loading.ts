import { useSyncExternalStore } from 'react';
import { projectSessionService, type ProjectSessionService } from '../../services/project/project_session_service';

export function useProjectLoading(service: ProjectSessionService = projectSessionService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange);

            return () => service.removeEventListener('changed', onStoreChange);
        },
        () => service.getSnapshot().isProjectLoading,
        () => service.getSnapshot().isProjectLoading,
    );
}
