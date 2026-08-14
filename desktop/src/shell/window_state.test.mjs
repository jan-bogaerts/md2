import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createManagedWindow } = require('./window_state');
let constructedWindow;

function BrowserWindowMock() {
    return constructedWindow;
}

describe('window state', () => {
    it('creates and manages a window using persisted outer geometry', () => {
        const window = { id: 'main-window' };
        constructedWindow = window;
        const windowState = {
            height: 720,
            manage: vi.fn(),
            width: 1100,
            x: 120,
            y: 80,
        };
        const windowStateKeeper = vi.fn(() => windowState);
        const BrowserWindow = vi.fn(BrowserWindowMock);
        const browserWindowOptions = { icon: 'md2.ico', titleBarStyle: 'hidden' };

        const result = createManagedWindow({ BrowserWindow, browserWindowOptions, windowStateKeeper });

        expect(windowStateKeeper).toHaveBeenCalledWith({
            defaultHeight: 900,
            defaultWidth: 1280,
            fullScreen: false,
            maximize: true,
        });
        expect(BrowserWindow).toHaveBeenCalledWith({
            height: 720,
            icon: 'md2.ico',
            titleBarStyle: 'hidden',
            width: 1100,
            x: 120,
            y: 80,
        });
        expect(windowState.manage).toHaveBeenCalledWith(window);
        expect(BrowserWindow.mock.invocationCallOrder[0]).toBeLessThan(windowState.manage.mock.invocationCallOrder[0]);
        expect(result).toBe(window);
    });

    it('passes first-run automatic-position values through to BrowserWindow', () => {
        const window = {};
        constructedWindow = window;
        const windowState = { height: 900, manage: vi.fn(), width: 1280, x: undefined, y: undefined };
        const BrowserWindow = vi.fn(BrowserWindowMock);

        createManagedWindow({ BrowserWindow, browserWindowOptions: {}, windowStateKeeper: () => windowState });

        expect(BrowserWindow).toHaveBeenCalledWith({ height: 900, width: 1280, x: undefined, y: undefined });
    });
});
