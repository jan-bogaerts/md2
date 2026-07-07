import { GithubStorageService } from '../services/github_storage_service'
import { githubAuthService } from '../services/github_auth_service'
import { LocalGitStorageService } from '../services/local_git_storage_service'
import { RemoteControlStorageService } from '../services/remote_control_storage_service'
import type { ProjectReference, StorageService } from './data_types'
import { setActionBridgeOverride } from './electron_action_bridge'

export const LAST_PROJECT_STORAGE_KEY = 'md2.lastProject'

export type StorageType = 'github' | 'local' | 'remote'

export interface LastProject {
    project: ProjectReference
    storageType: StorageType
}

/** Create the storage backend for the chosen source. GitHub requires an access token. */
export function createStorageService(storageType: StorageType, accessToken: string | null): StorageService {
    if (storageType === 'remote') {
        const storage = new RemoteControlStorageService()
        storage.init()
        setActionBridgeOverride(storage)

        return storage
    }

    setActionBridgeOverride(null)

    if (storageType === 'github') {
        const storage = new GithubStorageService()
        storage.init({
            accessToken: accessToken ?? '',
            onUnauthorized: () => githubAuthService.handleUnauthorized(),
        })

        return storage
    }

    const storage = new LocalGitStorageService()
    storage.init()

    return storage
}

export function readLastProject(): LastProject | null {
    const storedValue = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
    if (!storedValue) return null

    return JSON.parse(storedValue) as LastProject
}

export function writeLastProject(storageType: StorageType, project: ProjectReference) {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({ project, storageType }))
}
