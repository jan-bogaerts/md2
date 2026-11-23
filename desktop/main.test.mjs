import Module, { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const MAIN_PATH = require.resolve('./main.js');
const TELEMETRY_REQUEST = './src/integrations/telemetry';
const STOP_LOADING_MESSAGE = 'Stopped at first application module';
const originalLoad = Module._load;

function createTelemetryStub(events) {
    return {
        captureError: () => undefined,
        flush: async () => undefined,
        registerProcessErrorHandlers: () => events.push('registerProcessErrorHandlers'),
        startElectronTelemetry: () => {
            events.push('startElectronTelemetry');
            return Promise.resolve();
        },
        trackEvent: async () => undefined,
    };
}

function createElectronStub() {
    return { app: { isPackaged: false } };
}

function createFileSystemStub() {
    return { ...require('node:fs'), existsSync: () => false };
}

/** Loads main.js with stubbed boundaries and stops at the first application module request. */
function loadMainUntilFirstApplicationModule(events) {
    Module._load = function loadWithStubs(request, parent, isMain) {
        if (parent?.filename !== MAIN_PATH) return originalLoad.call(this, request, parent, isMain);
        if (request === 'electron') return createElectronStub();
        if (request === 'node:fs') return createFileSystemStub();
        if (request.startsWith('node:')) return originalLoad.call(this, request, parent, isMain);
        if (request === TELEMETRY_REQUEST) return createTelemetryStub(events);

        events.push(`load:${request}`);
        throw new Error(STOP_LOADING_MESSAGE);
    };

    expect(() => require(MAIN_PATH)).toThrow(STOP_LOADING_MESSAGE);
}

describe('desktop main process startup', () => {
    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[MAIN_PATH];
    });

    it('starts Sentry and installs process error handlers before loading application modules', () => {
        const events = [];

        loadMainUntilFirstApplicationModule(events);

        expect(events).toEqual(['startElectronTelemetry', 'registerProcessErrorHandlers', 'load:electron-store']);
    });
});
