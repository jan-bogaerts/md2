import { useSyncExternalStore } from 'react'
import {
    projectPersistenceService,
    type ProjectPersistenceService,
    type ProjectPersistenceSnapshot,
} from '../../services/project/project_persistence_service'

const snapshots = new WeakMap<ProjectPersistenceService, ProjectPersistenceSnapshot>()

function isSameProjectPersistenceSnapshot(first: ProjectPersistenceSnapshot, second: ProjectPersistenceSnapshot) {
    return first.hasPendingPush === second.hasPendingPush
        && first.hasPendingSave === second.hasPendingSave
        && first.localSaveState === second.localSaveState
}

function getProjectPersistenceSnapshot(service: ProjectPersistenceService): ProjectPersistenceSnapshot {
    const nextSnapshot = service.getSnapshot()
    const currentSnapshot = snapshots.get(service)
    if (currentSnapshot && isSameProjectPersistenceSnapshot(currentSnapshot, nextSnapshot)) return currentSnapshot

    snapshots.set(service, nextSnapshot)

    return nextSnapshot
}

export function useProjectPersistence(service: ProjectPersistenceService = projectPersistenceService): ProjectPersistenceSnapshot {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => getProjectPersistenceSnapshot(service),
        () => getProjectPersistenceSnapshot(service),
    )
}
