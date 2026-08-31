import { GithubApiClient } from '../../auth/github_api_client'
import type { ProjectReference } from '../../data/data_types'
import type { GithubStorageDependencies, NormalizedGithubTreeEntry, PendingCommitHead } from './github_storage_types'
import { createPendingHeadKey } from './github_storage_types'
import { applicationStorage } from '../storage/application_storage'

const PENDING_COMMIT_HEADS_STORAGE_KEY = 'md2.github.pendingCommitHeads'
const PENDING_CONFLICT_MESSAGE = 'Unpushed GitHub commits conflict with the current branch. Discard pending commits or resolve the branch manually before opening this project.'

function readStoredPendingCommitHeads() {
    const storedValue = applicationStorage.getItem(PENDING_COMMIT_HEADS_STORAGE_KEY)
    if (!storedValue) return new Map<string, PendingCommitHead>()

    const parsedValue = JSON.parse(storedValue) as Record<string, PendingCommitHead>

    return new Map(Object.entries(parsedValue))
}

function writeStoredPendingCommitHeads(pendingCommitHeads: Map<string, PendingCommitHead>) {
    const storedValue = Object.fromEntries(pendingCommitHeads)

    if (Object.keys(storedValue).length === 0) {
        applicationStorage.removeItem(PENDING_COMMIT_HEADS_STORAGE_KEY)

        return
    }

    applicationStorage.setItem(PENDING_COMMIT_HEADS_STORAGE_KEY, JSON.stringify(storedValue))
}

export function readStoredPendingCommitHead(project: ProjectReference) {
    return readStoredPendingCommitHeads().get(createPendingHeadKey(project))
}

export function deleteStoredPendingCommitHead(project: ProjectReference) {
    const storedPendingHeads = readStoredPendingCommitHeads()
    storedPendingHeads.delete(createPendingHeadKey(project))
    writeStoredPendingCommitHeads(storedPendingHeads)
}

export class GithubPendingCommitConflictError extends Error {
    project: ProjectReference

    constructor(project: ProjectReference) {
        super(PENDING_CONFLICT_MESSAGE)
        this.project = project
    }
}

export class GithubStorageContext {
    private accessToken: string | null = null
    private activeProject: ProjectReference | null = null

    apiClient: GithubApiClient | null = null
    pendingCommitHeads = new Map<string, PendingCommitHead>()
    projectTreeEntriesByHead = new Map<string, NormalizedGithubTreeEntry[]>()
    recursiveTreeEntriesBySha = new Map<string, Map<string, string>>()

    init(dependencies: GithubStorageDependencies) {
        this.accessToken = dependencies.accessToken
        this.activeProject = null
        this.apiClient = new GithubApiClient(dependencies)
        this.pendingCommitHeads = readStoredPendingCommitHeads()
        this.projectTreeEntriesByHead = new Map()
        this.recursiveTreeEntriesBySha = new Map()
    }

    getAccessToken() {
        if (this.accessToken === null) throw new Error('GitHub storage access token is not initialized')

        return this.accessToken
    }

    getApiClient() {
        if (!this.apiClient) throw new Error('GitHub storage API client is not initialized')

        return this.apiClient
    }

    getCommitProject() {
        if (!this.activeProject) throw new Error('Cannot commit before a GitHub project is loaded')

        return this.activeProject
    }

    requireGithubProject(project: ProjectReference) {
        if (!project.owner) throw new Error('Missing GitHub project owner')
        if (!project.repository) throw new Error('Missing GitHub project repository')

        this.activeProject = project
    }

    writePendingCommitHeads() {
        writeStoredPendingCommitHeads(this.pendingCommitHeads)
    }
}
