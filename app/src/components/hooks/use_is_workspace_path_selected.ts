import { useSyncExternalStore } from 'react'
import { workspaceViewService, type WorkspaceViewService } from '../../services/project/workspace_view_service'

/** Subscribe only to whether one workspace path is selected. */
export function useIsWorkspacePathSelected(path: string, service: WorkspaceViewService = workspaceViewService): boolean {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot().selectedPath === path,
        () => service.getSnapshot().selectedPath === path,
    )
}
