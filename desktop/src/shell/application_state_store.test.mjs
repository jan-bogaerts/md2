import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    APPLICATION_STATE_STORE_NAME,
    createApplicationStateStore,
    readApplicationState,
    registerApplicationStateBridge,
    removeApplicationState,
    writeApplicationState,
} = require('./application_state_store');

class MemoryStore {
    constructor(options) {
        this.options = options;
        this.values = {};
    }

    delete(key) {
        delete this.values[key];
    }

    get(key, fallback) {
        return this.values[key] ?? fallback;
    }

    set(key, value) {
        this.values[key] = value;
    }

    get store() {
        return { ...this.values };
    }
}

describe('application state store', () => {
    it('uses separate JSON file and keeps dotted application keys literal', () => {
        const store = createApplicationStateStore(MemoryStore);

        expect(store.options).toEqual({
            accessPropertiesByDotNotation: false,
            name: APPLICATION_STATE_STORE_NAME,
        });
    });

    it('reads current values immediately before each operation', () => {
        const store = new MemoryStore();
        writeApplicationState(store, 'md2.lastProject', '{"project":"first"}');
        store.values['md2.lastProject'] = '{"project":"second"}';

        expect(readApplicationState(store, 'md2.lastProject')).toBe('{"project":"second"}');
        expect(readApplicationState(store, null)).toEqual({ 'md2.lastProject': '{"project":"second"}' });
    });

    it('uses latest completed write for one key and removes values', () => {
        const store = new MemoryStore();
        const setValue = vi.spyOn(store, 'set');

        writeApplicationState(store, 'md2.lastProject', 'first');
        writeApplicationState(store, 'md2.lastProject', 'second');
        removeApplicationState(store, 'md2.lastProject');

        expect(setValue).toHaveBeenNthCalledWith(1, 'md2.lastProject', 'first');
        expect(setValue).toHaveBeenNthCalledWith(2, 'md2.lastProject', 'second');
        expect(readApplicationState(store, 'md2.lastProject')).toBeNull();
    });

    it('rejects invalid renderer keys and values', () => {
        const store = new MemoryStore();

        expect(() => readApplicationState(store, '')).toThrow('Application-state key is required');
        expect(() => writeApplicationState(store, 'key', { value: true })).toThrow('Application-state value must be a string');
        expect(() => removeApplicationState(store, null)).toThrow('Application-state key is required');
    });

    it('registers read, write, and remove main-process handlers', async () => {
        const handlers = new Map();
        const ipcMain = { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) };
        const store = new MemoryStore();
        registerApplicationStateBridge(ipcMain, store);

        await handlers.get('md2-application-state:write')({}, 'md2.themeMode', 'dark');

        expect(await handlers.get('md2-application-state:read')({}, 'md2.themeMode')).toBe('dark');
        await handlers.get('md2-application-state:remove')({}, 'md2.themeMode');
        expect(await handlers.get('md2-application-state:read')({}, 'md2.themeMode')).toBeNull();
        expect(ipcMain.handle).toHaveBeenCalledTimes(3);
    });
});
