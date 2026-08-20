import { describe, expect, it, vi } from 'vitest'
import type { Card, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import type { DataService } from '../data/data_service'
import type { ProjectAccessService } from '../project/project_access_service'
import { createDeferred } from '../test_support/data_service_test_support'
import type { SentryConnectionService, SentryConnectionSnapshot } from './sentry_connection_service'
import { SentryImportService, SENTRY_POLL_INTERVAL_MS } from './sentry_import_service'
import { createDefaultSentryProjectSettings, type SentryIssueEvent, type SentryIssueSummary } from './sentry_types'

const project: ProjectReference = { branch: 'main', id: 'project-1' }
const emptySnapshot: ProjectSnapshot = { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
const issue: SentryIssueSummary = {
    count: '1',
    culprit: null,
    firstSeen: null,
    id: '100',
    lastSeen: null,
    link: null,
    title: 'Failure',
}
const event: SentryIssueEvent = {
    environment: 'production',
    eventId: 'event-100',
    message: 'Failed',
    release: null,
    stackFrames: [],
}

class FakeConnectionService extends EventTarget {
    snapshot: SentryConnectionSnapshot = {
        errorMessage: null,
        isAuthenticated: true,
        isConnecting: false,
        projectId: project.id,
        settings: {
            ...createDefaultSentryProjectSettings(),
            apiToken: 'token',
            automaticImport: true,
            cardState: 'to fix',
            cardType: 'bug',
            firstImportConfirmed: true,
            organization: 'acme',
            project: 'frontend',
        },
    }
    handleApiError = vi.fn()

    getSnapshot() { return this.snapshot }

    setProject(nextProject: ProjectReference | null) {
        this.snapshot = { ...this.snapshot, projectId: nextProject?.id ?? null }
    }

    saveSettings(settings: SentryConnectionSnapshot['settings']) {
        this.snapshot = { ...this.snapshot, settings }
        this.dispatchEvent(new Event('changed'))
    }
}

class FakeProjectAccessService extends EventTarget {
    readOnly = false

    getSnapshot() { return this.readOnly }

    setReadOnly(readOnly: boolean) {
        this.readOnly = readOnly
        this.dispatchEvent(new Event('changed'))
    }
}

class FakeDataService extends EventTarget {
    fullProjectLoaded = true
    currentProject: ProjectReference | null = project
    currentSnapshot: ProjectSnapshot | null = emptySnapshot
    cards = { importSentryIssues: vi.fn(async () => [{ content: '', path: 'design/B-1-failure.md' }]) }

    getState() {
        return { project: this.currentProject, runningAgents: [], snapshot: this.currentSnapshot }
    }

    isFullProjectLoaded() { return this.fullProjectLoaded }

    changeProject(nextProject: ProjectReference | null, snapshot: ProjectSnapshot | null = emptySnapshot) {
        this.currentProject = nextProject
        this.currentSnapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

function createService() {
    const apiClient = {
        listUnresolvedIssues: vi.fn(async () => [] as SentryIssueSummary[]),
        loadRecommendedEvent: vi.fn(async () => event),
    }
    const connectionService = new FakeConnectionService()
    const dataService = new FakeDataService()
    const projectAccessService = new FakeProjectAccessService()
    const intervalCallbacks: Array<() => void> = []
    const clearInterval = vi.fn()
    const setInterval = vi.fn((callback: () => void) => {
        intervalCallbacks.push(callback)
        return intervalCallbacks.length
    })
    const service = new SentryImportService({
        apiClient,
        clearInterval,
        connectionService: connectionService as unknown as SentryConnectionService,
        dataService: dataService as unknown as DataService,
        now: () => new Date('2026-01-03T00:00:00.000Z'),
        projectAccessService: projectAccessService as unknown as ProjectAccessService,
        setInterval,
    })

    return { apiClient, clearInterval, connectionService, dataService, intervalCallbacks, projectAccessService, service, setInterval }
}

describe('SentryImportService', () => {
    it('polls once when a writable project becomes ready and repeats every 15 minutes', async () => {
        const setup = createService()

        setup.service.start()
        await vi.waitFor(() => expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledOnce())
        await setup.service.importNow()

        expect(setup.setInterval).toHaveBeenCalledWith(expect.any(Function), SENTRY_POLL_INTERVAL_MS)
        setup.intervalCallbacks[0]()
        await vi.waitFor(() => expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledTimes(2))
        expect(setup.service.getSnapshot().lastSuccessfulPollAt).toBe('2026-01-03T00:00:00.000Z')
    })

    it('waits for archived and released cards to finish loading before first poll', async () => {
        const setup = createService()
        setup.dataService.fullProjectLoaded = false
        setup.service.start()

        expect(setup.apiClient.listUnresolvedIssues).not.toHaveBeenCalled()

        setup.dataService.fullProjectLoaded = true
        setup.dataService.dispatchEvent(new Event('changed'))
        await vi.waitFor(() => expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledOnce())
    })

    it('uses the same single in-flight operation for automatic and manual import', async () => {
        const setup = createService()
        const pendingIssues = createDeferred<SentryIssueSummary[]>()
        setup.apiClient.listUnresolvedIssues.mockImplementation(() => pendingIssues.promise)
        setup.service.start()

        const first = setup.service.importNow()
        const second = setup.service.importNow()

        expect(first).toBe(second)
        expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledOnce()
        pendingIssues.resolve([])
        await first
    })

    it('allows manual import while automatic import is disabled', async () => {
        const setup = createService()
        setup.connectionService.snapshot.settings.automaticImport = false
        setup.service.start()

        expect(setup.apiClient.listUnresolvedIssues).not.toHaveBeenCalled()

        await setup.service.importNow()

        expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledOnce()
    })

    it('stops scheduling for read-only, closed, disconnected, and incomplete projects', async () => {
        const setup = createService()
        setup.service.start()
        await vi.waitFor(() => expect(setup.apiClient.listUnresolvedIssues).toHaveBeenCalledOnce())

        setup.projectAccessService.setReadOnly(true)
        expect(setup.clearInterval).toHaveBeenCalledWith(1)

        setup.projectAccessService.setReadOnly(false)
        setup.dataService.changeProject(null, null)
        setup.connectionService.snapshot.isAuthenticated = false
        setup.connectionService.dispatchEvent(new Event('changed'))
        setup.dataService.changeProject(project)
        setup.connectionService.snapshot.isAuthenticated = true
        setup.connectionService.snapshot.settings.cardState = ''
        setup.connectionService.dispatchEvent(new Event('changed'))

        expect(setup.setInterval).toHaveBeenCalledTimes(2)
    })

    it('keeps background failures in service state without notifications', async () => {
        const setup = createService()
        const failure = new Error('Sentry timed out')
        setup.apiClient.listUnresolvedIssues.mockRejectedValue(failure)

        setup.service.start()
        await vi.waitFor(() => expect(setup.service.getSnapshot().isPolling).toBe(false))

        expect(setup.service.getSnapshot().latestError).toBe('Sentry timed out')
        expect(setup.connectionService.handleApiError).toHaveBeenCalledWith(failure)
    })

    it('discards issue results after project identity changes', async () => {
        const setup = createService()
        const pendingIssues = createDeferred<SentryIssueSummary[]>()
        setup.apiClient.listUnresolvedIssues.mockImplementation(() => pendingIssues.promise)
        setup.service.start()
        setup.dataService.changeProject({ branch: 'main', id: 'project-2' })

        pendingIssues.resolve([issue])
        await vi.waitFor(() => expect(setup.service.getSnapshot().isPolling).toBe(false))

        expect(setup.apiClient.loadRecommendedEvent).not.toHaveBeenCalled()
        expect(setup.dataService.cards.importSentryIssues).not.toHaveBeenCalled()
    })

    it('requires count confirmation before first non-empty import', async () => {
        const setup = createService()
        setup.connectionService.snapshot.settings.firstImportConfirmed = false
        setup.apiClient.listUnresolvedIssues.mockResolvedValue([issue])
        setup.service.start()
        await vi.waitFor(() => expect(setup.service.getSnapshot().confirmation).toEqual({ count: 1, projectId: 'project-1' }))

        expect(setup.apiClient.loadRecommendedEvent).not.toHaveBeenCalled()

        const imported = await setup.service.confirmFirstImport()

        expect(imported).toBe(1)
        expect(setup.connectionService.getSnapshot().settings.firstImportConfirmed).toBe(true)
        expect(setup.dataService.cards.importSentryIssues).toHaveBeenCalledOnce()
    })

    it('excludes existing cards and duplicate groups before loading event details', async () => {
        const setup = createService()
        const importedCard = {
            header: {
                sentryBaseUrl: 'https://sentry.io',
                sentryIssueId: '100',
                sentryOrganization: 'acme',
            },
        } as Card
        setup.dataService.currentSnapshot = { ...emptySnapshot, activeCards: [importedCard] }
        setup.apiClient.listUnresolvedIssues.mockResolvedValue([issue, issue, { ...issue, id: '101' }])

        await setup.service.importNow()

        expect(setup.apiClient.loadRecommendedEvent).toHaveBeenCalledOnce()
        expect(setup.apiClient.loadRecommendedEvent).toHaveBeenCalledWith(expect.any(Object), '101')
    })
})
