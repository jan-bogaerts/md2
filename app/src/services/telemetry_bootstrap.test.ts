import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../data/electron_data_bridge'

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
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(async () => undefined),
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

describe('startReactTelemetry', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.stubEnv('APTABASE_APP_KEY', 'aptabase-key')
        vi.stubEnv('SENTRY_DSN', 'sentry-dsn')
        telemetryMocks.aptabaseInit.mockClear()
        telemetryMocks.aptabaseTrackEvent.mockClear()
        telemetryMocks.sentryCaptureException.mockClear()
        telemetryMocks.sentryFlush.mockClear()
        telemetryMocks.sentryInit.mockClear()
    })

    afterEach(() => {
        delete window.md2Data
        vi.unstubAllEnvs()
    })

    it('emits one web start event when no Electron bridge exists', async () => {
        const { startReactTelemetry } = await import('./telemetry_bootstrap')

        startReactTelemetry()
        startReactTelemetry()

        expect(telemetryMocks.sentryInit).toHaveBeenCalledWith({ dsn: 'sentry-dsn' })
        expect(telemetryMocks.aptabaseInit).toHaveBeenCalledWith('aptabase-key')
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledTimes(1)
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledWith('react_start', { runtime: 'react_web' })
    })

    it('classifies start as Electron-connected when the preload bridge exists', async () => {
        window.md2Data = createBridge()
        const { startReactTelemetry } = await import('./telemetry_bootstrap')

        startReactTelemetry()

        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledWith('react_start', { runtime: 'react_electron' })
    })

    it('captures global errors and emits stop on unload without details', async () => {
        const { startReactTelemetry } = await import('./telemetry_bootstrap')
        const error = new Error('boom')

        startReactTelemetry()
        window.dispatchEvent(new ErrorEvent('error', { error, message: 'boom' }))
        window.dispatchEvent(new Event('beforeunload'))

        expect(telemetryMocks.sentryCaptureException).toHaveBeenCalledWith(error)
        expect(telemetryMocks.aptabaseTrackEvent).toHaveBeenCalledWith('react_stop', { runtime: 'react_web' })
    })
})
