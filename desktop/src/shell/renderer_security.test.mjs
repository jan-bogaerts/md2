import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { isTrustedRendererLocation, registerNavigationGuards, resolveRendererTarget } = require('./renderer_security');

describe('renderer target resolution', () => {
    it('uses the development launcher URL while unpackaged', () => {
        expect(resolveRendererTarget(false, 'ignored', { MD2_APP_URL: 'http://localhost:5173' })).toEqual({
            trustedLocation: 'http://localhost:5173',
            type: 'url',
            url: 'http://localhost:5173',
        });
    });

    it('uses the configured Vite URL while unpackaged', () => {
        expect(resolveRendererTarget(false, 'ignored', { MD2_APP_URL: 'http://localhost:5173' })).toEqual({
            trustedLocation: 'http://localhost:5173',
            type: 'url',
            url: 'http://localhost:5173',
        });
    });

    it('ignores MD2_APP_URL and resolves bundled React while packaged', () => {
        const appDirectory = path.join('C:', 'Program Files', 'MD²', 'resources', 'app.asar');
        const filePath = path.join(appDirectory, 'renderer', 'index.html');

        expect(resolveRendererTarget(true, appDirectory, { MD2_APP_URL: 'https://evil.example' })).toEqual({
            filePath,
            trustedLocation: pathToFileURL(filePath).href,
            type: 'file',
        });
    });
});

describe('renderer navigation guards', () => {
    function createWebContents() {
        const listeners = {};
        const webContents = {
            on: vi.fn((event, listener) => { listeners[event] = listener; }),
            setWindowOpenHandler: vi.fn((handler) => { webContents.windowOpenHandler = handler; }),
            windowOpenHandler: null,
        };

        return { listeners, webContents };
    }

    function createNavigationDetails(url, isMainFrame = true) {
        return { isMainFrame, preventDefault: vi.fn(), url };
    }

    it('allows only the trusted renderer document navigation', () => {
        expect(isTrustedRendererLocation('file:///C:/Program%20Files/MD2/index.html#board', 'file:///C:/Program%20Files/MD2/index.html')).toBe(true);
        expect(isTrustedRendererLocation('https://evil.example', 'file:///C:/Program%20Files/MD2/index.html')).toBe(false);
    });

    it('allows trusted main-frame navigation including hash changes', () => {
        const { listeners, webContents } = createWebContents();
        const openExternal = vi.fn(async () => undefined);
        const details = createNavigationDetails('file:///C:/MD2/index.html#board');
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal);

        listeners['will-frame-navigate'](details);

        expect(details.preventDefault).not.toHaveBeenCalled();
        expect(openExternal).not.toHaveBeenCalled();
    });

    it.each(['http://docs.example/path', 'https://docs.example/path'])(
        'blocks main-frame navigation and opens %s externally',
        (url) => {
            const { listeners, webContents } = createWebContents();
            const openExternal = vi.fn(async () => undefined);
            const details = createNavigationDetails(url);
            registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal);

            listeners['will-frame-navigate'](details);

            expect(details.preventDefault).toHaveBeenCalled();
            expect(openExternal).toHaveBeenCalledWith(url);
        },
    );

    it.each(['file:///C:/project/data.json', 'mailto:user@example.com', 'md2:open'])('blocks untrusted main-frame navigation to %s', (url) => {
        const { listeners, webContents } = createWebContents();
        const openExternal = vi.fn(async () => undefined);
        const details = createNavigationDetails(url);
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal);

        listeners['will-frame-navigate'](details);

        expect(details.preventDefault).toHaveBeenCalled();
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('ignores subframe navigation', () => {
        const { listeners, webContents } = createWebContents();
        const openExternal = vi.fn(async () => undefined);
        const details = createNavigationDetails('https://embedded.example/path', false);
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal);

        listeners['will-frame-navigate'](details);

        expect(details.preventDefault).not.toHaveBeenCalled();
        expect(openExternal).not.toHaveBeenCalled();
    });

    it.each([
        ['http://docs.example/path', true],
        ['https://docs.example/path', true],
        ['file:///C:/project/data.json', false],
        ['javascript:alert(1)', false],
    ])('denies new-window request for %s and applies external protocol policy', (url, shouldOpenExternal) => {
        const { webContents } = createWebContents();
        const openExternal = vi.fn(async () => undefined);
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal);

        expect(webContents.windowOpenHandler({ url })).toEqual({ action: 'deny' });
        if (shouldOpenExternal) expect(openExternal).toHaveBeenCalledWith(url);
        else expect(openExternal).not.toHaveBeenCalled();
    });
});
