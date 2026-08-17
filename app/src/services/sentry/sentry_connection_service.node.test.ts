import { describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import { SentryApiError } from './sentry_api_client'
import {
    SENTRY_CONNECTION_STORAGE_KEY,
    SentryConnectionService,
    type SentryConnectionServiceDependencies,
} from './sentry_connection_service'
import { createDefaultSentryProjectSettings, type SentryProjectSettings } from './sentry_types'

function createMemoryStorage() {
    const values = new Map<string, string>()

    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
    }
}

function project(id: string): ProjectReference {
    return { branch: 'main', id }
}

function configuredSettings(overrides: Partial<SentryProjectSettings> = {}): SentryProjectSettings {
    return {
        ...createDefaultSentryProjectSettings(),
        apiBaseUrl: 'https://sentry.example.com/',
        apiToken: ' secret ',
        cardState: 'to fix',
        cardType: 'bug',
        environment: ' production ',
        organization: ' acme ',
        project: ' frontend ',
        ...overrides,
    }
}

function createService(overrides: Partial<SentryConnectionServiceDependencies> = {}) {
    const dependencies = {
        apiClient: { validateProject: vi.fn(async () => undefined) },
        storage: createMemoryStorage(),
        ...overrides,
    }
    const service = new SentryConnectionService()
    service.init(dependencies)

    return { dependencies, service }
}

describe('SentryConnectionService', () => {
    it('validates, normalizes, and persists project-scoped settings', async () => {
        const { dependencies, service } = createService()
        service.setProject(project('project-1'))

        await service.connect(configuredSettings())

        expect(dependencies.apiClient.validateProject).toHaveBeenCalledWith(expect.objectContaining({
            apiBaseUrl: 'https://sentry.example.com',
            apiToken: 'secret',
            environment: 'production',
            organization: 'acme',
            project: 'frontend',
        }))
        expect(service.getSnapshot()).toMatchObject({ errorMessage: null, isAuthenticated: true })
        expect(dependencies.storage.getItem(SENTRY_CONNECTION_STORAGE_KEY)).toContain('secret')
    })

    it('restores each project settings record independently', async () => {
        const { service } = createService()
        service.setProject(project('project-1'))
        await service.connect(configuredSettings({ organization: 'first' }))
        service.setProject(project('project-2'))

        expect(service.getSnapshot().settings.organization).toBe('')

        await service.connect(configuredSettings({ organization: 'second' }))
        service.setProject(project('project-1'))

        expect(service.getSnapshot().settings.organization).toBe('first')
        expect(service.getSnapshot().isAuthenticated).toBe(true)
    })

    it('does not persist settings when validation fails', async () => {
        const apiClient = { validateProject: vi.fn(async () => { throw new Error('Project not found') }) }
        const { dependencies, service } = createService({ apiClient })
        service.setProject(project('project-1'))

        await service.connect(configuredSettings())

        expect(dependencies.storage.getItem(SENTRY_CONNECTION_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'Project not found',
            isAuthenticated: false,
            settings: { apiToken: 'secret', organization: 'acme', project: 'frontend' },
        })
    })

    it('disconnects and removes token without writing project files', async () => {
        const { dependencies, service } = createService()
        service.setProject(project('project-1'))
        await service.connect(configuredSettings({ automaticImport: true }))

        service.disconnect()

        const stored = dependencies.storage.getItem(SENTRY_CONNECTION_STORAGE_KEY) ?? ''
        expect(stored).not.toContain('secret')
        expect(service.getSnapshot()).toMatchObject({ isAuthenticated: false })
        expect(service.getSnapshot().settings.automaticImport).toBe(false)
    })

    it('disconnects and retains a clear error after unauthorized API response', async () => {
        const { service } = createService()
        service.setProject(project('project-1'))
        await service.connect(configuredSettings())

        service.handleApiError(new SentryApiError('Unauthorized', 401))

        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'Sentry authorization expired. Connect again.',
            isAuthenticated: false,
        })
        expect(service.getSnapshot().settings.apiToken).toBe('')
    })

    it('clears an existing persisted token when reconnect validation is unauthorized', async () => {
        const { dependencies, service } = createService()
        service.setProject(project('project-1'))
        await service.connect(configuredSettings())
        vi.mocked(dependencies.apiClient.validateProject).mockRejectedValue(new SentryApiError('Unauthorized', 401))

        await service.connect(configuredSettings({ apiToken: 'replacement' }))

        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'Sentry authorization expired. Connect again.',
            isAuthenticated: false,
        })
        expect(dependencies.storage.getItem(SENTRY_CONNECTION_STORAGE_KEY)).not.toContain('secret')
        expect(dependencies.storage.getItem(SENTRY_CONNECTION_STORAGE_KEY)).not.toContain('replacement')
    })
})
