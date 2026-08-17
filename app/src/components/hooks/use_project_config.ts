import { useSyncExternalStore } from 'react'
import type { ProjectConfig } from '../../data/data_types'
import { dataService, type DataService } from '../../services/data/data_service'

const snapshots = new WeakMap<DataService, ProjectConfig | null>()

function isSameProjectConfig(first: ProjectConfig | null, second: ProjectConfig | null) {
    return first?.actionsFolder === second?.actionsFolder
        && first?.archivedFolder === second?.archivedFolder
        && first?.backgroundShade === second?.backgroundShade
        && first?.cardTypes === second?.cardTypes
        && first?.diffCommand === second?.diffCommand
        && first?.projectFolder === second?.projectFolder
        && first?.pushMode === second?.pushMode
        && first?.releasesFolder === second?.releasesFolder
        && first?.states === second?.states
        && first?.workingFolder === second?.workingFolder
}

function getProjectConfigSnapshot(service: DataService): ProjectConfig | null {
    const nextSnapshot = service.getConfig()
    const currentSnapshot = snapshots.get(service)
    if (snapshots.has(service) && isSameProjectConfig(currentSnapshot ?? null, nextSnapshot)) return currentSnapshot ?? null

    snapshots.set(service, nextSnapshot)

    return nextSnapshot
}

/** Subscribe to project config exposed through the data service. */
export function useProjectConfig(service: DataService = dataService): ProjectConfig | null {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => getProjectConfigSnapshot(service),
        () => getProjectConfigSnapshot(service),
    )
}
