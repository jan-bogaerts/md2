import { GithubStorageService } from '../services/github_storage_service'
import { LocalGitStorageService } from '../services/local_git_storage_service'
import { DEFAULT_CARD_TYPES, type ProjectConfig, type ProjectReference, type PushMode, type StorageService } from './data_types'

export const LAST_PROJECT_STORAGE_KEY = 'md2.lastProject'
const WORKING_FOLDER = 'design'

export type StorageType = 'github' | 'local'

export interface LastProject {
    project: ProjectReference
    storageType: StorageType
}

/** Build the project config for a session; kept small until a settings feature owns it. */
export function createProjectConfig(pushMode: PushMode): ProjectConfig {
    return {
        cardTypes: DEFAULT_CARD_TYPES,
        pushMode,
        workingFolder: WORKING_FOLDER,
    }
}

/** Create the storage backend for the chosen source. GitHub requires an access token. */
export function createStorageService(storageType: StorageType, accessToken: string | null): StorageService {
    if (storageType === 'github') {
        const storage = new GithubStorageService()
        storage.init({ accessToken: accessToken ?? '' })

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
