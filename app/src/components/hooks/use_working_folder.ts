import { useSyncExternalStore } from 'react'
import { DEFAULT_PROJECT_FOLDER, DEFAULT_WORKING_FOLDER } from '../../data/data_types'
import { dataService, type DataService } from '../../services/data/data_service'

const DEFAULT_WORKING_FOLDER_PATH = `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_WORKING_FOLDER}`

function getWorkingFolder(service: DataService): string {
    return service.getState().snapshot?.workingFolder
        ?? service.getConfig()?.workingFolder
        ?? DEFAULT_WORKING_FOLDER_PATH
}

/** Subscribe only to loaded working-folder path. */
export function useWorkingFolder(service: DataService = dataService): string {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => getWorkingFolder(service),
        () => getWorkingFolder(service),
    )
}
