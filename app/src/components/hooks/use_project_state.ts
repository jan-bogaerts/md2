import { useSyncExternalStore } from 'react'
import { dataService, type DataService, type DataServiceState } from '../../services/data/data_service'

const snapshots = new WeakMap<DataService, DataServiceState>()

function isSameDataServiceState(first: DataServiceState, second: DataServiceState) {
    return first.hasPendingPush === second.hasPendingPush
        && first.hasPendingSave === second.hasPendingSave
        && first.project === second.project
        && first.runningAgents === second.runningAgents
        && first.snapshot === second.snapshot
}

function getProjectStateSnapshot(service: DataService): DataServiceState {
    const nextSnapshot = service.getState()
    const currentSnapshot = snapshots.get(service)
    if (currentSnapshot && isSameDataServiceState(currentSnapshot, nextSnapshot)) return currentSnapshot

    snapshots.set(service, nextSnapshot)

    return nextSnapshot
}

export function useProjectState(service: DataService = dataService): DataServiceState {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => getProjectStateSnapshot(service),
        () => getProjectStateSnapshot(service),
    )
}
