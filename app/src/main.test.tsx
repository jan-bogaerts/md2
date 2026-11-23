import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrapMocks = vi.hoisted(() => ({
    callOrder: [] as string[],
    captureError: vi.fn(),
    initializeStorage: vi.fn(async () => undefined),
    startApplication: vi.fn(async () => undefined),
    startTelemetry: vi.fn(),
}))

vi.mock('./prism_bootstrap', () => ({}))

vi.mock('./app', () => ({ App: () => <div>application</div> }))

vi.mock('./services/application_startup_service', () => ({applicationStartupService: { start: bootstrapMocks.startApplication }}))

vi.mock('./services/storage/application_storage', () => ({applicationStorage: { initialize: bootstrapMocks.initializeStorage }}))

vi.mock('./services/telemetry/telemetry_service', () => ({telemetryService: { captureError: bootstrapMocks.captureError, start: bootstrapMocks.startTelemetry }}))

async function importBootstrap() {
    await import('./main')
}

describe('renderer bootstrap', () => {
    beforeEach(() => {
        vi.resetModules()
        document.body.innerHTML = '<div id="root"></div>'
        bootstrapMocks.callOrder.length = 0
        bootstrapMocks.captureError.mockReset()
        bootstrapMocks.initializeStorage.mockReset().mockImplementation(async () => {
            bootstrapMocks.callOrder.push('storage')
        })
        bootstrapMocks.startApplication.mockReset().mockResolvedValue(undefined)
        bootstrapMocks.startTelemetry.mockReset().mockImplementation(() => {
            bootstrapMocks.callOrder.push('telemetry')
        })
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('starts telemetry before asynchronous storage initialization', async () => {
        await importBootstrap()

        expect(await screen.findByText('application')).toBeInTheDocument()
        expect(bootstrapMocks.callOrder).toEqual(['telemetry', 'storage'])
    })

    it('reports storage startup failures to telemetry and renders the failure', async () => {
        const error = new Error('storage unavailable')
        bootstrapMocks.initializeStorage.mockRejectedValue(error)

        await importBootstrap()

        expect(await screen.findByRole('alert')).toHaveTextContent('Application state could not be loaded: storage unavailable')
        await waitFor(() => expect(bootstrapMocks.captureError).toHaveBeenCalledWith(error))
        expect(bootstrapMocks.startTelemetry).toHaveBeenCalledOnce()
        expect(bootstrapMocks.startApplication).not.toHaveBeenCalled()
    })
})
