import type { Card, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import type { SentryIssueImportRequest } from '../data/card_operations'
import type { DataService } from '../data/data_service'
import { dataService } from '../data/data_service'
import type { ProjectAccessService } from '../project/project_access_service'
import { projectAccessService } from '../project/project_access_service'
import { register } from '../service_injector'
import type { SentryApiClient, SentryApiRequest } from './sentry_api_client'
import { sentryApiClient } from './sentry_api_client'
import type { SentryConnectionService } from './sentry_connection_service'
import { sentryConnectionService } from './sentry_connection_service'
import {
    isSentryConfigurationComplete,
    sentryIdentityKey,
    type SentryIssueSummary,
    type SentryProjectSettings,
} from './sentry_types'

export const SENTRY_POLL_INTERVAL_MS = 15 * 60 * 1000

export interface SentryImportConfirmation {
    count: number
    projectId: string
}

export interface SentryImportSnapshot {
    confirmation: SentryImportConfirmation | null
    isPolling: boolean
    lastImportCount: number | null
    lastSuccessfulPollAt: string | null
    latestError: string | null
}

export interface SentryImportServiceDependencies {
    apiClient: Pick<SentryApiClient, 'listUnresolvedIssues' | 'loadRecommendedEvent'>
    connectionService: SentryConnectionService
    dataService: DataService
    now(): Date
    projectAccessService: ProjectAccessService
    setInterval(callback: () => void, delay: number): number
    clearInterval(handle: number): void
}

const INITIAL_SNAPSHOT: SentryImportSnapshot = {
    confirmation: null,
    isPolling: false,
    lastImportCount: null,
    lastSuccessfulPollAt: null,
    latestError: null,
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unexpected Sentry import error'
}

function allCards(snapshot: ProjectSnapshot) {
    return [...snapshot.activeCards, ...snapshot.backgroundCards]
}

function importedIdentities(cards: Card[]) {
    return new Set(cards.flatMap(({ header }) => {
        const { sentryBaseUrl, sentryIssueId, sentryOrganization } = header
        if (!sentryBaseUrl || !sentryIssueId || !sentryOrganization) return []

        return [sentryIdentityKey(sentryBaseUrl, sentryOrganization, sentryIssueId)]
    }))
}

function uniqueUnseenIssues(issues: SentryIssueSummary[], snapshot: ProjectSnapshot, settings: SentryProjectSettings) {
    const existing = importedIdentities(allCards(snapshot))
    const selected = new Set<string>()

    return issues.filter(({ id }) => {
        const identity = sentryIdentityKey(settings.apiBaseUrl, settings.organization, id)
        if (existing.has(identity) || selected.has(identity)) return false
        selected.add(identity)

        return true
    })
}

function requestFromSettings(settings: SentryProjectSettings): SentryApiRequest {
    return {
        apiBaseUrl: settings.apiBaseUrl,
        apiToken: settings.apiToken,
        environment: settings.environment,
        organization: settings.organization,
        project: settings.project,
    }
}

function scheduleKey(project: ProjectReference, settings: SentryProjectSettings) {
    return [
        project.id,
        settings.apiBaseUrl,
        settings.organization,
        settings.project,
        settings.environment,
        settings.cardType,
        settings.cardState,
    ].join('\n')
}

export class SentryImportService extends EventTarget {
    private readonly dependencies: SentryImportServiceDependencies
    private intervalHandle: number | null = null
    private pollPromise: Promise<number> | null = null
    private scheduledKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT
    private started = false

    constructor(dependencies: SentryImportServiceDependencies) {
        super()
        this.dependencies = dependencies
        register('sentryImportService', this)
    }

    getSnapshot() {
        return this.snapshot
    }

    start() {
        if (this.started) return
        this.started = true
        this.dependencies.dataService.addEventListener('changed', this.handleDependencyChange)
        this.dependencies.connectionService.addEventListener('changed', this.handleDependencyChange)
        this.dependencies.projectAccessService.addEventListener('changed', this.handleDependencyChange)
        this.syncSchedule()
    }

    stop() {
        if (!this.started) return
        this.started = false
        this.dependencies.dataService.removeEventListener('changed', this.handleDependencyChange)
        this.dependencies.connectionService.removeEventListener('changed', this.handleDependencyChange)
        this.dependencies.projectAccessService.removeEventListener('changed', this.handleDependencyChange)
        this.clearSchedule()
    }

    importNow() {
        return this.poll(true)
    }

    confirmFirstImport() {
        const confirmation = this.snapshot.confirmation
        if (!confirmation) return Promise.resolve(0)
        const { connectionService, dataService } = this.dependencies
        if (dataService.getState().project?.id !== confirmation.projectId) {
            this.setSnapshot({ confirmation: null })
            return Promise.resolve(0)
        }

        connectionService.saveSettings({ ...connectionService.getSnapshot().settings, firstImportConfirmed: true })
        this.setSnapshot({ confirmation: null })

        return this.poll(true)
    }

    cancelFirstImport() {
        this.setSnapshot({ confirmation: null })
    }

    private readonly handleDependencyChange = () => {
        this.syncSchedule()
    }

    private syncSchedule() {
        const { connectionService, dataService, projectAccessService } = this.dependencies
        const { project, snapshot } = dataService.getState()
        connectionService.setProject(project)
        const connection = connectionService.getSnapshot()
        const canPoll = !!project
            && !!snapshot
            && dataService.isFullProjectLoaded()
            && !projectAccessService.getSnapshot()
            && connection.isAuthenticated
            && connection.settings.automaticImport
            && isSentryConfigurationComplete(connection.settings)
        if (!canPoll || !project) {
            this.clearSchedule()
            return
        }

        const nextKey = scheduleKey(project, connection.settings)
        if (this.scheduledKey === nextKey) return

        this.clearSchedule()
        this.scheduledKey = nextKey
        void this.poll(false)
        this.intervalHandle = this.dependencies.setInterval(this.handleInterval, SENTRY_POLL_INTERVAL_MS)
    }

    private readonly handleInterval = () => {
        void this.poll(false)
    }

    private clearSchedule() {
        if (this.intervalHandle !== null) this.dependencies.clearInterval(this.intervalHandle)
        this.intervalHandle = null
        this.scheduledKey = null
        if (this.snapshot.confirmation) this.setSnapshot({ confirmation: null })
    }

    private poll(manual: boolean) {
        if (this.pollPromise) return this.pollPromise

        this.pollPromise = this.runPoll(manual).finally(() => {
            this.pollPromise = null
        })

        return this.pollPromise
    }

    private async runPoll(manual: boolean) {
        const { apiClient, connectionService, dataService, projectAccessService } = this.dependencies
        const { project, snapshot } = dataService.getState()
        const connection = connectionService.getSnapshot()
        const settings = connection.settings
        const canPoll = !!project
            && !!snapshot
            && dataService.isFullProjectLoaded()
            && !projectAccessService.getSnapshot()
            && connection.isAuthenticated
            && isSentryConfigurationComplete(settings)
            && (manual || settings.automaticImport)
        if (!canPoll || !project || !snapshot) return 0

        const projectId = project.id
        const startingKey = scheduleKey(project, settings)
        this.setSnapshot({ isPolling: true, latestError: null })

        try {
            const issues = await apiClient.listUnresolvedIssues(requestFromSettings(settings))
            if (!this.isCurrentRequest(projectId, startingKey)) return 0
            const unseenIssues = uniqueUnseenIssues(issues, dataService.getState().snapshot as ProjectSnapshot, settings)
            if (!settings.firstImportConfirmed && unseenIssues.length > 0) {
                this.setSnapshot({
                    confirmation: { count: unseenIssues.length, projectId },
                    lastSuccessfulPollAt: this.dependencies.now().toISOString(),
                })
                return 0
            }

            const importedIssues = await Promise.all(unseenIssues.map(async (issue) => {
                const event = await apiClient.loadRecommendedEvent(requestFromSettings(settings), issue.id)

                return { event: { ...event, environment: event.environment ?? settings.environment }, issue }
            }))
            if (!this.isCurrentRequest(projectId, startingKey)) return 0

            const importRequest: SentryIssueImportRequest = {
                apiBaseUrl: settings.apiBaseUrl,
                cardState: settings.cardState,
                cardType: settings.cardType,
                issues: importedIssues,
                organization: settings.organization,
                projectId,
            }
            const importedFiles = await dataService.cards.importSentryIssues(importRequest)
            this.setSnapshot({
                confirmation: null,
                lastImportCount: importedFiles.length,
                lastSuccessfulPollAt: this.dependencies.now().toISOString(),
                latestError: null,
            })

            return importedFiles.length
        } catch (error) {
            connectionService.handleApiError(error)
            this.setSnapshot({ latestError: errorMessage(error) })
            return 0
        } finally {
            this.setSnapshot({ isPolling: false })
        }
    }

    private isCurrentRequest(projectId: string, startingKey: string) {
        const project = this.dependencies.dataService.getState().project
        const connection = this.dependencies.connectionService.getSnapshot()

        return project?.id === projectId
            && connection.projectId === projectId
            && scheduleKey(project, connection.settings) === startingKey
            && !this.dependencies.projectAccessService.getSnapshot()
    }

    private setSnapshot(snapshot: Partial<SentryImportSnapshot>) {
        this.snapshot = { ...this.snapshot, ...snapshot }
        this.dispatchEvent(new CustomEvent<SentryImportSnapshot>('changed', { detail: this.snapshot }))
    }
}

const DEFAULT_DEPENDENCIES: SentryImportServiceDependencies = {
    apiClient: sentryApiClient,
    clearInterval: (handle) => window.clearInterval(handle),
    connectionService: sentryConnectionService,
    dataService,
    now: () => new Date(),
    projectAccessService,
    setInterval: (callback, delay) => window.setInterval(callback, delay),
}

export const sentryImportService = new SentryImportService(DEFAULT_DEPENDENCIES)
