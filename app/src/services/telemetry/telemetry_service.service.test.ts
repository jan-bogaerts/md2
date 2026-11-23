import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { TelemetryService } from './telemetry_service'

const telemetryMocks = vi.hoisted(() => ({
    aptabaseElectronTrackEvent: vi.fn(async () => undefined),
    aptabaseWebInit: vi.fn(),
    aptabaseWebTrackEvent: vi.fn(async () => undefined),
    electronSentryInit: vi.fn(),
    sentryCaptureException: vi.fn(),
    sentryFlush: vi.fn(async () => true),
    sentryInit: vi.fn(),
}))

vi.mock('@aptabase/web', () => ({
    init: telemetryMocks.aptabaseWebInit,
    trackEvent: telemetryMocks.aptabaseWebTrackEvent,
}))

vi.mock('@aptabase/electron/renderer', () => ({ trackEvent: telemetryMocks.aptabaseElectronTrackEvent }))

vi.mock('@sentry/electron/renderer', () => ({ init: telemetryMocks.electronSentryInit }))

vi.mock('@sentry/react', () => ({
    captureException: telemetryMocks.sentryCaptureException,
    flush: telemetryMocks.sentryFlush,
    init: telemetryMocks.sentryInit,
}))

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project) => project),
        commit: vi.fn(async () => []),
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
        writeFiles: vi.fn(async () => undefined),
    }
}

describe('TelemetryService', () => {
    beforeEach(() => {
        vi.stubEnv('MD2_APTABASE_APP_KEY', 'aptabase-key')
        vi.stubEnv('MD2_SENTRY_DSN', 'sentry-dsn')
        vi.stubEnv('PROD', true)
        // Each started service registers a window unload listener; keep them from leaking across tests.
        vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined)
        telemetryMocks.aptabaseElectronTrackEvent.mockReset().mockResolvedValue(undefined)
        telemetryMocks.aptabaseWebInit.mockReset()
        telemetryMocks.aptabaseWebTrackEvent.mockReset().mockResolvedValue(undefined)
        telemetryMocks.electronSentryInit.mockReset()
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
        expect(telemetryMocks.aptabaseWebInit).toHaveBeenCalledOnce()
        expect(telemetryMocks.aptabaseWebInit).toHaveBeenCalledWith('aptabase-key')
        expect(telemetryMocks.aptabaseWebTrackEvent).toHaveBeenCalledOnce()
        expect(telemetryMocks.aptabaseWebTrackEvent).toHaveBeenCalledWith('react_start', { runtime: 'react_web' })
        expect(telemetryMocks.aptabaseElectronTrackEvent).not.toHaveBeenCalled()
        expect(telemetryMocks.electronSentryInit).not.toHaveBeenCalled()
    })

    it('initializes the Electron renderer SDK combined with the React initializer and no renderer DSN', () => {
        window.md2Data = createBridge()
        const service = new TelemetryService()

        service.start()

        expect(telemetryMocks.electronSentryInit).toHaveBeenCalledOnce()
        expect(telemetryMocks.electronSentryInit).toHaveBeenCalledWith({}, telemetryMocks.sentryInit)
        expect(telemetryMocks.sentryInit).not.toHaveBeenCalled()
    })

    it('captures handled errors through the shared React client in the Electron runtime', () => {
        window.md2Data = createBridge()
        const service = new TelemetryService()
        const error = new Error('renderer failed')
        service.start()

        service.captureError(error)

        expect(telemetryMocks.sentryCaptureException).toHaveBeenCalledWith(error)
    })

    it('classifies usage as Electron-connected when the preload bridge exists', () => {
        window.md2Data = createBridge()
        const service = new TelemetryService()

        service.start()

        expect(telemetryMocks.aptabaseWebInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseWebTrackEvent).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseElectronTrackEvent).toHaveBeenCalledWith(
            'react_start',
            { runtime: 'react_electron' },
        )
    })

    it('does not initialize Sentry in development', () => {
        vi.stubEnv('PROD', false)
        const service = new TelemetryService()

        service.start()

        expect(telemetryMocks.sentryInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseWebInit).toHaveBeenCalledWith('aptabase-key')
    })

    it.each([
        { electronConnected: false, runtime: 'web' },
        { electronConnected: true, runtime: 'Electron' },
    ])('no-ops in $runtime runtime when telemetry keys are absent', async ({ electronConnected }) => {
        vi.stubEnv('MD2_APTABASE_APP_KEY', '')
        vi.stubEnv('MD2_SENTRY_DSN', '')
        if (electronConnected) window.md2Data = createBridge()
        const service = new TelemetryService()

        service.start()
        service.trackEvent('create_card')
        service.captureError(new Error('boom'))
        await service.flush()

        expect(telemetryMocks.sentryInit).not.toHaveBeenCalled()
        expect(telemetryMocks.electronSentryInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseWebInit).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseWebTrackEvent).not.toHaveBeenCalled()
        expect(telemetryMocks.aptabaseElectronTrackEvent).not.toHaveBeenCalled()
        expect(telemetryMocks.sentryCaptureException).not.toHaveBeenCalled()
    })

    it.each([
        { electronConnected: false, runtime: 'web' },
        { electronConnected: true, runtime: 'Electron' },
    ])('isolates synchronous Aptabase failures in $runtime runtime', ({ electronConnected }) => {
        const trackEvent = electronConnected
            ? telemetryMocks.aptabaseElectronTrackEvent
            : telemetryMocks.aptabaseWebTrackEvent
        if (electronConnected) window.md2Data = createBridge()
        trackEvent.mockImplementationOnce(() => {
            throw new Error('Aptabase failed')
        })
        const service = new TelemetryService()

        expect(() => service.start()).not.toThrow()
    })

    it('rejects unsupported usage events before they can leak payload data', () => {
        const service = new TelemetryService()
        service.start()

        expect(() => service.trackEvent('design/F-1.md' as never)).toThrow('Unsupported telemetry event')
        expect(telemetryMocks.aptabaseWebTrackEvent).toHaveBeenCalledOnce()
    })

    it('captures handled errors and uses a bounded flush', async () => {
        vi.useFakeTimers()
        const service = new TelemetryService()
        service.start()
        telemetryMocks.aptabaseWebTrackEvent.mockImplementation(() => new Promise(() => undefined))
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
