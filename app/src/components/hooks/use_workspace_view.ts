import { useSyncExternalStore } from 'react'
import { workspaceViewService, type WorkspaceViewService } from '../../services/workspace_view_service'

export function useWorkspaceView(service: WorkspaceViewService = workspaceViewService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
