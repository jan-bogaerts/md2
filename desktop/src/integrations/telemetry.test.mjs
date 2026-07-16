import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const telemetryMocks = vi.hoisted(() => ({
    aptabase: {
        initialize: vi.fn(async () => undefined),
        trackEvent: vi.fn(async () => undefined),
    },
    sentry: {
        captureException: vi.fn(),
        flush: vi.fn(async () => true),
        init: vi.fn(),
    },
}));

function loadTelemetry() {
    return require('./telemetry');
}

function startTelemetry(
    telemetry,
    environment = { MD2_APTABASE_APP_KEY: 'aptabase-key', MD2_SENTRY_DSN: 'sentry-dsn' },
    isDevelopment = false,
) {
    return telemetry.startElectronTelemetry({
        aptabaseClient: telemetryMocks.aptabase,
        environment,
        isDevelopment,
        sentryClient: telemetryMocks.sentry,
    });
}

describe('desktop telemetry', () => {
    beforeEach(() => {
        vi.resetModules();
        telemetryMocks.aptabase.initialize.mockClear();
        telemetryMocks.aptabase.trackEvent.mockClear();
        telemetryMocks.sentry.captureException.mockClear();
        telemetryMocks.sentry.flush.mockClear();
        telemetryMocks.sentry.init.mockClear();
    });

    afterEach(() => {
        const telemetry = loadTelemetry();
        telemetry.resetTelemetryForTests();
    });

    it('initializes configured clients and emits electron_starting without domain details', async () => {
        const telemetry = loadTelemetry();

        await startTelemetry(telemetry);

        expect(telemetryMocks.sentry.init).toHaveBeenCalledWith({ dsn: 'sentry-dsn' });
        expect(telemetryMocks.aptabase.initialize).toHaveBeenCalledWith('aptabase-key');
        expect(telemetryMocks.aptabase.trackEvent).toHaveBeenCalledWith('electron_starting', { runtime: 'electron_main' });
    });

    it('no-ops when keys are absent', async () => {
        const telemetry = loadTelemetry();

        await startTelemetry(telemetry, {});
        telemetry.captureError(new Error('boom'));
        await telemetry.trackEvent('electron_stop');
        await telemetry.flush();

        expect(telemetryMocks.sentry.init).not.toHaveBeenCalled();
        expect(telemetryMocks.aptabase.initialize).not.toHaveBeenCalled();
        expect(telemetryMocks.aptabase.trackEvent).not.toHaveBeenCalled();
        expect(telemetryMocks.sentry.captureException).not.toHaveBeenCalled();
    });

    it('does not initialize Sentry in development', async () => {
        const telemetry = loadTelemetry();

        await startTelemetry(telemetry, undefined, true);
        telemetry.captureError(new Error('boom'));

        expect(telemetryMocks.sentry.init).not.toHaveBeenCalled();
        expect(telemetryMocks.sentry.captureException).not.toHaveBeenCalled();
        expect(telemetryMocks.aptabase.initialize).toHaveBeenCalledWith('aptabase-key');
    });

    it('captures main-process errors and flushes stop telemetry', async () => {
        const telemetry = loadTelemetry();
        const error = new Error('main failed');

        await startTelemetry(telemetry);
        telemetry.captureError(error);
        await telemetry.trackEvent('electron_stop');
        await telemetry.flush(25);

        expect(telemetryMocks.sentry.captureException).toHaveBeenCalledWith(error);
        expect(telemetryMocks.aptabase.trackEvent).toHaveBeenCalledWith('electron_stop', { runtime: 'electron_main' });
        expect(telemetryMocks.sentry.flush).toHaveBeenCalledWith(25);
    });

    it('rejects unsupported Electron usage events', async () => {
        const telemetry = loadTelemetry();
        await startTelemetry(telemetry);

        expect(() => telemetry.trackEvent('design/F-1.md')).toThrow('Unsupported telemetry event');
    });
});
