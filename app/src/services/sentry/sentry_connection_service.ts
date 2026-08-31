import type { ProjectReference } from '../../data/data_types'
import { register } from '../service_injector'
import { applicationStorage } from '../storage/application_storage'
import { SentryApiClient, SentryApiError, sentryApiClient } from './sentry_api_client'
import {
    createDefaultSentryProjectSettings,
    normalizeSentryBaseUrl,
    type SentryProjectSettings,
} from './sentry_types'

export const SENTRY_CONNECTION_STORAGE_KEY = 'md2.sentry.connections'

export interface SentryConnectionSnapshot {
    errorMessage: string | null
    isAuthenticated: boolean
    isConnecting: boolean
    projectId: string | null
    settings: SentryProjectSettings
}

export interface SentryConnectionServiceDependencies {
    apiClient: Pick<SentryApiClient, 'validateProject'>
    storage: Pick<Storage, 'getItem' | 'setItem'>
}

type StoredConnections = Record<string, SentryProjectSettings>

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unexpected Sentry connection error'
}

const SENTRY_FORBIDDEN_MESSAGE = 'Sentry denied access. Confirm token has event:read access to configured organization and project.'

function readConnections(storage: Pick<Storage, 'getItem'>): StoredConnections {
    const stored = storage.getItem(SENTRY_CONNECTION_STORAGE_KEY)
    if (!stored) return {}

    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored Sentry connections are invalid')

    return parsed as StoredConnections
}

function normalizedSettings(settings: SentryProjectSettings): SentryProjectSettings {
    const apiToken = settings.apiToken.trim()
    const organization = settings.organization.trim()
    const project = settings.project.trim()
    const environment = settings.environment.trim()
    if (!apiToken) throw new Error('Sentry API token is required')
    if (!organization) throw new Error('Sentry organization is required')
    if (!project) throw new Error('Sentry project is required')
    if (!environment) throw new Error('Sentry environment is required')

    return {
        ...settings,
        apiBaseUrl: normalizeSentryBaseUrl(settings.apiBaseUrl),
        apiToken,
        environment,
        organization,
        project,
    }
}

export class SentryConnectionService extends EventTarget {
    private apiClient: Pick<SentryApiClient, 'validateProject'> | null = null
    private projectId: string | null = null
    private snapshot: SentryConnectionSnapshot = {
        errorMessage: null,
        isAuthenticated: false,
        isConnecting: false,
        projectId: null,
        settings: createDefaultSentryProjectSettings(),
    }
    private storage: Pick<Storage, 'getItem' | 'setItem'> | null = null

    constructor() {
        super()
        register('sentryConnectionService', this)
    }

    init(dependencies: SentryConnectionServiceDependencies) {
        this.apiClient = dependencies.apiClient
        this.storage = dependencies.storage
        this.setProject(null)
    }

    getSnapshot() {
        return this.snapshot
    }

    setProject(project: ProjectReference | null) {
        const projectId = project?.id ?? null
        if (projectId === this.projectId && this.snapshot.projectId === projectId) return

        this.projectId = projectId
        const settings = projectId ? this.readProjectSettings(projectId) : createDefaultSentryProjectSettings()
        this.setSnapshot({
            errorMessage: null,
            isAuthenticated: settings.apiToken.length > 0,
            isConnecting: false,
            projectId,
            settings,
        })
    }

    async connect(settings: SentryProjectSettings) {
        const projectId = this.requireProjectId()
        const apiClient = this.requireApiClient()
        const nextSettings = normalizedSettings(settings)
        this.setSnapshot({ errorMessage: null, isAuthenticated: false, isConnecting: true, settings: nextSettings })

        try {
            await apiClient.validateProject(nextSettings)
            if (projectId !== this.projectId) return
            this.writeProjectSettings(projectId, nextSettings)
            this.setSnapshot({
                errorMessage: null,
                isAuthenticated: true,
                isConnecting: false,
                settings: nextSettings,
            })
        } catch (error) {
            if (projectId !== this.projectId) return
            if (error instanceof SentryApiError && error.status === 401) {
                this.handleUnauthorized()
                return
            }
            if (error instanceof SentryApiError && error.status === 403) {
                this.setSnapshot({ errorMessage: SENTRY_FORBIDDEN_MESSAGE, isConnecting: false })
                return
            }
            this.setSnapshot({
                errorMessage: errorMessage(error),
                isConnecting: false,
            })
        }
    }

    saveSettings(settings: SentryProjectSettings) {
        const projectId = this.requireProjectId()
        const current = this.snapshot.settings
        const identityChanged = normalizeSentryBaseUrl(current.apiBaseUrl) !== normalizeSentryBaseUrl(settings.apiBaseUrl)
            || current.organization.trim() !== settings.organization.trim()
            || current.project.trim() !== settings.project.trim()
        const nextSettings = normalizedSettings({
            ...settings,
            firstImportConfirmed: identityChanged ? false : settings.firstImportConfirmed,
        })
        this.writeProjectSettings(projectId, nextSettings)
        this.setSnapshot({ settings: nextSettings })
    }

    disconnect() {
        const projectId = this.requireProjectId()
        const settings = { ...this.snapshot.settings, apiToken: '', automaticImport: false }
        this.writeProjectSettings(projectId, settings)
        this.setSnapshot({ errorMessage: null, isAuthenticated: false, isConnecting: false, settings })
    }

    handleUnauthorized() {
        const projectId = this.requireProjectId()
        const settings = { ...this.snapshot.settings, apiToken: '', automaticImport: false }
        this.writeProjectSettings(projectId, settings)
        this.setSnapshot({
            errorMessage: 'Sentry authorization expired. Connect again.',
            isAuthenticated: false,
            isConnecting: false,
            settings,
        })
    }

    handleApiError(error: unknown) {
        if (error instanceof SentryApiError && error.status === 401) this.handleUnauthorized()
        if (error instanceof SentryApiError && error.status === 403) {
            const projectId = this.requireProjectId()
            const settings = { ...this.snapshot.settings, automaticImport: false }
            this.writeProjectSettings(projectId, settings)
            this.setSnapshot({ errorMessage: SENTRY_FORBIDDEN_MESSAGE, isAuthenticated: false, isConnecting: false, settings })
        }
    }

    private readProjectSettings(projectId: string) {
        const { storage } = this.requireDependencies()
        const stored = readConnections(storage)[projectId]

        return stored ? { ...createDefaultSentryProjectSettings(), ...stored } : createDefaultSentryProjectSettings()
    }

    private writeProjectSettings(projectId: string, settings: SentryProjectSettings) {
        const { storage } = this.requireDependencies()
        const connections = readConnections(storage)
        storage.setItem(SENTRY_CONNECTION_STORAGE_KEY, JSON.stringify({ ...connections, [projectId]: settings }))
    }

    private requireApiClient() {
        if (!this.apiClient) throw new Error('Sentry connection service API client is not initialized')

        return this.apiClient
    }

    private requireDependencies() {
        if (!this.storage) throw new Error('Sentry connection service storage is not initialized')

        return { storage: this.storage }
    }

    private requireProjectId() {
        if (!this.projectId) throw new Error('Cannot configure Sentry before a project is open')

        return this.projectId
    }

    private setSnapshot(snapshot: Partial<SentryConnectionSnapshot>) {
        this.snapshot = { ...this.snapshot, ...snapshot }
        this.dispatchEvent(new CustomEvent<SentryConnectionSnapshot>('changed', { detail: this.snapshot }))
    }
}

export function initDefaultSentryConnectionService(service: SentryConnectionService) {
    service.init({ apiClient: sentryApiClient, storage: applicationStorage })

    return service
}

export const sentryConnectionService = new SentryConnectionService()
