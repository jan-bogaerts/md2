import { useSyncExternalStore } from 'react'
import {
    PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT,
    projectFolderGitInclusionService,
} from '../../services/project/project_folder_git_inclusion_service'

function subscribe(onStoreChange: () => void) {
    projectFolderGitInclusionService.addEventListener(PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT, onStoreChange)

    return () => projectFolderGitInclusionService.removeEventListener(PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT, onStoreChange)
}

function readPendingProjectFolder() {
    return projectFolderGitInclusionService.getPendingProjectFolder()
}

/** Project folder awaiting Git index removal confirmation, or null when none is pending. */
export function usePendingProjectFolderGitRemoval() {
    return useSyncExternalStore(subscribe, readPendingProjectFolder, readPendingProjectFolder)
}
