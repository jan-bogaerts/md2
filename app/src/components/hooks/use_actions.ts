import { useSyncExternalStore } from 'react'
import {
    ACTIONS_CHANGED_EVENT,
    actionService,
    type ActionService,
    type ActionServiceState,
} from '../../services/actions/action_service'

const snapshots = new WeakMap<ActionService, ActionServiceState>()

function isSameActionServiceState(first: ActionServiceState, second: ActionServiceState) {
    return first.actions === second.actions && first.error === second.error
}

function getActionServiceSnapshot(service: ActionService): ActionServiceState {
    const nextSnapshot = service.getState()
    const currentSnapshot = snapshots.get(service)
    if (currentSnapshot && isSameActionServiceState(currentSnapshot, nextSnapshot)) return currentSnapshot

    snapshots.set(service, nextSnapshot)

    return nextSnapshot
}

/** Subscribe to the loaded action definitions exposed by the action service. */
export function useActions(service: ActionService = actionService): ActionServiceState {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener(ACTIONS_CHANGED_EVENT, onStoreChange)

            return () => service.removeEventListener(ACTIONS_CHANGED_EVENT, onStoreChange)
        },
        () => getActionServiceSnapshot(service),
        () => getActionServiceSnapshot(service),
    )
}
