import { useSyncExternalStore } from 'react'
import type { FileTreeAction } from '../../data/file_tree'
import { actionService, type ActionService } from '../../services/actions/action_service'
import { ACTIONS_CHANGED_EVENT } from '../../services/actions/action_service_events'

const snapshots = new WeakMap<ActionService, FileTreeAction[]>()

function isSameFileTreeActions(first: FileTreeAction[], second: FileTreeAction[]) {
    return first.length === second.length && first.every((action, index) => {
        const candidate = second[index]

        return action.builtin === candidate.builtin
            && action.label === candidate.label
            && action.sourcePath === candidate.sourcePath
    })
}

function getFileTreeActionsSnapshot(service: ActionService): FileTreeAction[] {
    const nextSnapshot = service.getActions().map(({ builtin, label, sourcePath }) => ({ builtin, label, sourcePath }))
    const currentSnapshot = snapshots.get(service)
    if (currentSnapshot && isSameFileTreeActions(currentSnapshot, nextSnapshot)) return currentSnapshot

    snapshots.set(service, nextSnapshot)

    return nextSnapshot
}

/** Subscribe only to published action fields represented by file-tree nodes. */
export function useActionFileTreeActions(service: ActionService = actionService): FileTreeAction[] {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener(ACTIONS_CHANGED_EVENT, onStoreChange)

            return () => service.removeEventListener(ACTIONS_CHANGED_EVENT, onStoreChange)
        },
        () => getFileTreeActionsSnapshot(service),
        () => getFileTreeActionsSnapshot(service),
    )
}
