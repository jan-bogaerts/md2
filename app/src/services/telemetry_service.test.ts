import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelemetryService } from './telemetry_service'

function createClients() {
    return {
        aptabase: {
            init: vi.fn(),
            trackEvent: vi.fn(async () => undefined),
        },
        sentry: {
            captureException: vi.fn(),
            flush: vi.fn(async () => true),
            init: vi.fn(),
        },
    }
}

describe('TelemetryService', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('initializes configured clients and sends only runtime usage context', async () => {
        const clients = createClients()
        const service = new TelemetryService()

        service.init({
            aptabaseAppKey: 'aptabase-key',
            clients,
            runtime: 'react_electron',
            sentryDsn: 'sentry-dsn',
        })
        service.trackEvent('create_card')
        await service.flush()

        expect(clients.sentry.init).toHaveBeenCalledWith({ dsn: 'sentry-dsn' })
        expect(clients.aptabase.init).toHaveBeenCalledWith('aptabase-key')
        expect(clients.aptabase.trackEvent).toHaveBeenCalledWith('create_card', { runtime: 'react_electron' })
    })

    it('no-ops when telemetry keys are absent', async () => {
        const clients = createClients()
        const service = new TelemetryService()

        service.init({ clients, runtime: 'react_web' })
        service.trackEvent('react_start')
        service.captureError(new Error('boom'))
        await service.flush()

        expect(clients.sentry.init).not.toHaveBeenCalled()
        expect(clients.aptabase.init).not.toHaveBeenCalled()
        expect(clients.aptabase.trackEvent).not.toHaveBeenCalled()
        expect(clients.sentry.captureException).not.toHaveBeenCalled()
    })

    it('rejects unsupported usage events before they can leak payload data', () => {
        const clients = createClients()
        const service = new TelemetryService()
        service.init({ aptabaseAppKey: 'aptabase-key', clients, runtime: 'react_web' })

        expect(() => service.trackEvent('design/F-1.md' as never)).toThrow('Unsupported telemetry event')
        expect(clients.aptabase.trackEvent).not.toHaveBeenCalled()
    })

    it('captures errors and uses a bounded flush', async () => {
        vi.useFakeTimers()
        const clients = createClients()
        clients.aptabase.trackEvent.mockImplementation(() => new Promise(() => undefined))
        const service = new TelemetryService()

        service.init({ aptabaseAppKey: 'aptabase-key', clients, runtime: 'react_web', sentryDsn: 'sentry-dsn' })
        const error = new Error('failed')
        service.trackEvent('react_stop')
        service.captureError(error)
        const flush = service.flush(25)

        await vi.advanceTimersByTimeAsync(25)
        await flush

        expect(clients.sentry.captureException).toHaveBeenCalledWith(error)
        expect(clients.sentry.flush).toHaveBeenCalledWith(25)
    })
})
