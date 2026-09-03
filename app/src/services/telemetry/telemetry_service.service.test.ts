import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { TelemetryService } from './telemetry_service'

const telemetryMocks = vi.hoisted(() => ({
    aptabaseInit: vi.fn(),
    aptabaseTrackEvent: vi.fn(async () => undefined),
    sentryCaptureException: vi.fn(),
    sentryFlush: vi.fn(async () => true),
    sentryInit: vi.fn(),
}))

vi.mock('@aptabase/web', () => ({
    init: telemetryMocks.aptabaseInit,
    trackEvent: telemetryMocks.aptabaseTrackEvent,
}))

vi.mock('@sentry/react', () => ({
    captureException: telemetryMocks.sentryCaptureException,
    flush: telemetryMocks.sentryFlush,
    init: telemetryMocks.sentryInit,
}))

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project) => project),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        deleteFile: vi.fn(async () => undefined),
        deleteFolder: vi.fn(async () => undefined),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => ({ content: '', path: 'design/empty.md' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(async () => undefined),
        openProjectFolder: vi.fn(async () => null),
        push: vi.fn(async () => undefined),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(async () => undefined),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('TelemetryService', () => {
    beforeEach(() => {
        vi.stubEnv('MD2_APTABASE_APP_KEY', 'aptabase-key')
        vi.stubEnv('MD2_SENTRY_DSN', 'sentry-dsn')
        vi.stubEnv('PROD', true)
        telemetryMocks.aptabaseInit.mockReset()
        telemetryMocks.aptabaseTrackEvent.mockReset().mockResolvedValue(undefined)
        telemetryMocks.sentryCaptureException.mockReset()
        telemetryMocks.sentryFlush.mockReset().mockResolvedValue(true)
        telemetryMocks.sentryInit.mockReset()
    })

    afterEach(() => {
        delete window.md2Data
        vi.unstubAllEnvs()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('initializes configured clients once and sends only web runtime usage context', () => {
        const service = new TelemetryService()

        service.start()
        service.start()

        expect(telemetryMocks.sentryInit).toHaveBeenCalledOnce()
        expect(telemetryMocks.sentryInit).toHaveBeenCalledWith({ dsn: 'sentry-dsn' })
        expect(telemetryMocks.aptabaseInit).toHaveBeenCalledOnce()
        expect(telemetryMocks.aptabaseInit).toHaveBeenCalledWith('aptabase-key')
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledOnce()
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledWith('react_start', { runtime: 'react_web' })
    })

    it('classifies usage as Electron-connected when the preload bridge exists', () => {
        window.md2Data = createBridge()
        const service = new TelemetryService()

        service.start()

        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledWith('react_start', { runtime: 'react_electron' })
    })

    it('does not initialize Sentry in development', () => {
        vi.stubEnv('PROD', false)
        const service = new TelemetryService()

        service.start()

        expect(telemetryMocks.sentryInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseInit).toHaveBeenCalledWith('aptabase-key')
    })

    it('no-ops when telemetry keys are absent', async () => {
        vi.stubEnv('MD2_APTABASE_APP_KEY', '')
        vi.stubEnv('MD2_SENTRY_DSN', '')
        const service = new TelemetryService()

        service.start()
        service.trackEvent('create_card')
        service.captureError(new Error('boom'))
        await service.flush()

        expect(telemetryMocks.sentryInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseTrackEvent).not.toHaveBeenCalled()
        expect(telemetryMocks.sentryCaptureException).not.toHaveBeenCalled()
    })

    it('rejects unsupported usage events before they can leak payload data', () => {
        const service = new TelemetryService()
        service.start()

        expect(() => service.trackEvent('design/F-1.md' as never)).toThrow('Unsupported telemetry event')
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledOnce()
    })

    it('captures handled errors and uses a bounded flush', async () => {
        vi.useFakeTimers()
        const service = new TelemetryService()
        service.start()
        telemetryMocks.aptabaseTrackEvent.mockImplementation(() => new Promise(() => undefined))
        const error = new Error('failed')

        service.trackEvent('react_stop')
        service.captureError(error)
        const flush = service.flush(25)
        await vi.advanceTimersByTimeAsync(25)
        await flush

        expect(telemetryMocks.sentryCaptureException).toHaveBeenCalledWith(error)
        expect(telemetryMocks.sentryFlush).toHaveBeenCalledWith(25)
    })

    it('flushes telemetry on unload without registering duplicate global error handlers', () => {
        const addEventListener = vi.spyOn(window, 'addEventListener')
        const service = new TelemetryService()

        service.start()

        expect(addEventListener).toHaveBeenCalledOnce()
        expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
        expect(addEventListener).not.toHaveBeenCalledWith('error', expect.any(Function))
        expect(addEventListener).not.toHaveBeenCalledWith('unhandledrejection', expect.any(Function))
    })
})
