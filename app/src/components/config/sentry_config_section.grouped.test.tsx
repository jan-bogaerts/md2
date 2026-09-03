import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../../services/config/config_service'
import { dataService } from '../../services/data/data_service'
import { projectAccessService } from '../../services/project/project_access_service'
import { sentryConnectionService } from '../../services/sentry/sentry_connection_service'
import { sentryImportService } from '../../services/sentry/sentry_import_service'
import { createStorage } from '../../services/test_support/data_service_test_support'
import { SentryConfigSection } from './sentry_config_section'
import { actionService } from '../../services/actions/action_service'
import { openFilesService } from '../../services/open_files_service'
import { projectPersistenceService } from '../../services/project/project_persistence_service'

describe('SentryConfigSection', () => {
    const validateProject = vi.fn(async () => undefined)

    beforeEach(async () => {
        window.localStorage.clear()
        configService.init()
        openFilesService.init({ actionService, dataService })
        projectPersistenceService.init({ actionService, dataService, openFilesService })
        dataService.init({ storage: createStorage() })
        await dataService.projectLoading.openProject({ branch: 'main', id: 'project-1' })
        projectAccessService.setReadOnly(false)
        sentryConnectionService.init({ apiClient: { validateProject }, storage: window.localStorage })
        sentryConnectionService.setProject({ branch: 'main', id: 'project-1' })
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        validateProject.mockClear()
        projectAccessService.setReadOnly(false)
        configService.clear()
        window.localStorage.clear()
    })

    it('validates a masked project-specific connection with configured type and state', async () => {
        render(<SentryConfigSection />)

        expect(screen.getByLabelText('Sentry API token')).toHaveAttribute('type', 'password')
        expect(screen.getByLabelText('Organization slug')).toHaveAttribute('placeholder', 'acme')
        expect(screen.getByLabelText('Project slug')).toHaveAttribute('placeholder', 'frontend')
        expect(screen.getByLabelText('Sentry API token')).toHaveAttribute('placeholder', 'Paste personal auth token')
        expect(screen.getByText(/Personal Auth Token from User Settings/u)).toHaveTextContent('event:read')
        expect(screen.getByText(/Organization Auth Tokens are for CI/u)).toBeInTheDocument()
        expect(screen.getByText(/Do not use a DSN, client key, or client secret/u)).toBeInTheDocument()
        expect(screen.getByText('Imported Sentry issues become cards of this type.')).toBeInTheDocument()
        expect(screen.getByText('New cards start in this project state.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Organization slug'), { target: { value: 'acme' } })
        fireEvent.change(screen.getByLabelText('Project slug'), { target: { value: 'frontend' } })
        fireEvent.change(screen.getByLabelText('Sentry API token'), { target: { value: 'token' } })
        fireEvent.mouseDown(screen.getByLabelText('Target card type'))
        fireEvent.click(screen.getByRole('option', { name: 'Bug' }))
        fireEvent.mouseDown(screen.getByLabelText('Target card state'))
        fireEvent.click(screen.getByRole('option', { name: 'to fix' }))
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

        await waitFor(() => expect(validateProject).toHaveBeenCalledWith(expect.objectContaining({
            apiToken: 'token',
            cardState: 'to fix',
            cardType: 'bug',
            organization: 'acme',
            project: 'frontend',
        })))
        expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    })

    it('restores attempted settings when failed validation remounts config', async () => {
        validateProject.mockRejectedValueOnce(new Error('Invalid Sentry request'))
        const view = render(<SentryConfigSection />)

        fireEvent.change(screen.getByLabelText('Organization slug'), { target: { value: 'acme' } })
        fireEvent.change(screen.getByLabelText('Project slug'), { target: { value: 'frontend' } })
        fireEvent.change(screen.getByLabelText('Sentry API token'), { target: { value: 'token' } })
        fireEvent.mouseDown(screen.getByLabelText('Target card type'))
        fireEvent.click(screen.getByRole('option', { name: 'Bug' }))
        fireEvent.mouseDown(screen.getByLabelText('Target card state'))
        fireEvent.click(screen.getByRole('option', { name: 'to fix' }))
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
        await screen.findByText('Invalid Sentry request')

        view.unmount()
        render(<SentryConfigSection />)

        expect(screen.getByLabelText('Organization slug')).toHaveValue('acme')
        expect(screen.getByLabelText('Project slug')).toHaveValue('frontend')
        expect(screen.getByLabelText('Sentry API token')).toHaveValue('token')
        expect(screen.getByLabelText('Target card type')).toHaveTextContent('Bug')
        expect(screen.getByLabelText('Target card state')).toHaveTextContent('to fix')
        expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled()
    })

    it('enables automatic and manual imports only for a complete connected project', async () => {
        await sentryConnectionService.connect({
            ...sentryConnectionService.getSnapshot().settings,
            apiToken: 'token',
            cardState: 'to fix',
            cardType: 'bug',
            organization: 'acme',
            project: 'frontend',
        })
        const importNow = vi.spyOn(sentryImportService, 'importNow').mockResolvedValue(0)
        render(<SentryConfigSection />)

        fireEvent.click(screen.getByRole('switch', { name: 'Enable automatic import' }))
        fireEvent.click(screen.getByRole('button', { name: 'Import now' }))

        expect(sentryConnectionService.getSnapshot().settings.automaticImport).toBe(true)
        expect(importNow).toHaveBeenCalledOnce()
    })

    it('disables connection and import controls for a read-only project', async () => {
        await sentryConnectionService.connect({
            ...sentryConnectionService.getSnapshot().settings,
            apiToken: 'token',
            cardState: 'to fix',
            cardType: 'bug',
            organization: 'acme',
            project: 'frontend',
        })
        projectAccessService.setReadOnly(true)

        render(<SentryConfigSection />)

        expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Import now' })).toBeDisabled()
        expect(screen.getByRole('switch', { name: 'Enable automatic import' })).toBeDisabled()
    })

    it('shows last result, successful poll time, and latest background error once', () => {
        const snapshot = {
            confirmation: null,
            isPolling: false,
            lastImportCount: 2,
            lastSuccessfulPollAt: '2026-01-03T00:00:00.000Z',
            latestError: 'Sentry timed out',
        }
        vi.spyOn(sentryImportService, 'getSnapshot').mockReturnValue(snapshot)

        render(<SentryConfigSection />)

        expect(screen.getByText('Last import created 2 card(s).')).toBeInTheDocument()
        expect(screen.getByText('Last successful poll: 2026-01-03T00:00:00.000Z')).toBeInTheDocument()
        expect(screen.getAllByText('Latest import error: Sentry timed out')).toHaveLength(1)
    })
})
