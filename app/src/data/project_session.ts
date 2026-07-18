import { GithubStorageService } from '../services/github/github_storage_service'
import { githubAuthService } from '../services/github/github_auth_service'
import { LocalGitStorageService } from '../services/data/local_git_storage_service'
import { RemoteControlStorageService } from '../services/data/remote_control_storage_service'
import type { ProjectReference, StorageService } from './data_types'

export const LAST_PROJECT_STORAGE_KEY = 'md2.lastProject'

export type StorageType = 'github' | 'local' | 'remote'

export interface LastProject {
    project: ProjectReference
    storageType: StorageType
}

const STORAGE_TYPES: StorageType[] = ['github', 'local', 'remote']

function isProjectReference(value: unknown): value is ProjectReference {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false

    const project = value as Partial<ProjectReference>

    return typeof project.branch === 'string' && typeof project.id === 'string'
}

function isStorageType(value: unknown): value is StorageType {
    return typeof value === 'string' && STORAGE_TYPES.includes(value as StorageType)
}

function isLastProject(value: unknown): value is LastProject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false

    const lastProject = value as Partial<LastProject>

    return isStorageType(lastProject.storageType) && isProjectReference(lastProject.project)
}

function discardLastProject() {
    window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
}

/** Create only the storage backend for the chosen source. GitHub requires an access token. */
export function createStorageService(storageType: StorageType, accessToken: string | null): StorageService {
    if (storageType === 'remote') {
        const storage = new RemoteControlStorageService()
        storage.init()

        return storage
    }

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

    let parsedValue: unknown
    try {
        parsedValue = JSON.parse(storedValue)
    } catch {
        discardLastProject()

        return null
    }

    if (isLastProject(parsedValue)) return parsedValue

    discardLastProject()

    return null
}

export function writeLastProject(storageType: StorageType, project: ProjectReference) {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({ project, storageType }))
}
