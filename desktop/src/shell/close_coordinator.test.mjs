import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CloseCoordinator } = require('./close_coordinator');

function createWindow() {
    let destroyed = false;
    const browserWindow = new EventEmitter();
    const webContents = new EventEmitter();
    webContents.isDestroyed = vi.fn(() => destroyed);
    browserWindow.webContents = webContents;
    browserWindow.isDestroyed = vi.fn(() => destroyed);
    browserWindow.close = vi.fn(() => {
        const event = { preventDefault: vi.fn() };
        browserWindow.emit('close', event);
        if (!event.preventDefault.mock.calls.length) destroyed = true;
    });

    return { browserWindow, destroyRenderer: () => webContents.emit('destroyed'), webContents };
}

function createHarness(windows, responses = []) {
    const requests = [];
    const completeApplicationQuit = vi.fn(async () => undefined);
    const showMessageBox = vi.fn(async () => ({ response: responses.shift() ?? 1 }));
    const coordinator = new CloseCoordinator({
        completeApplicationQuit,
        flushTimeoutMs: 1000,
        getWindows: () => windows.map(({ browserWindow }) => browserWindow),
        sendFlushRequest: (webContents, request) => requests.push({ request, webContents }),
        showMessageBox,
    });

    return { completeApplicationQuit, coordinator, requests, showMessageBox };
}

describe('CloseCoordinator', () => {
    it('intercepts native close, shares repeated work, and closes only after renderer success', async () => {
        const target = createWindow();
        const { coordinator, requests } = createHarness([target]);
        coordinator.bindWindow(target.browserWindow);

        const closeEvent = { preventDefault: vi.fn() };
        target.browserWindow.emit('close', closeEvent);
        expect(closeEvent.preventDefault).toHaveBeenCalledOnce();
        const firstAttempt = coordinator.requestWindowClose(target.browserWindow);
        const repeatedAttempt = coordinator.requestWindowClose(target.browserWindow);
        expect(repeatedAttempt).toBe(firstAttempt);
        expect(requests).toHaveLength(1);
        expect(requests[0].request).toMatchObject({ reason: 'window-close' });
        expect(target.browserWindow.close).not.toHaveBeenCalled();

        coordinator.handleFlushResult(target.webContents, { requestId: requests[0].request.requestId, success: true });
        await firstAttempt;
        expect(target.browserWindow.close).toHaveBeenCalledOnce();
        expect(requests).toHaveLength(1);
    });

    it('retries a failed close with a new request', async () => {
        const target = createWindow();
        const { coordinator, requests } = createHarness([target], [0]);
        const attempt = coordinator.requestWindowClose(target.browserWindow);
        coordinator.handleFlushResult(target.webContents, { requestId: requests[0].request.requestId, success: false });
        await vi.waitFor(() => expect(requests).toHaveLength(2));
        expect(requests[1].request.requestId).not.toBe(requests[0].request.requestId);

        coordinator.handleFlushResult(target.webContents, { requestId: requests[1].request.requestId, success: true });
        await attempt;
        expect(target.browserWindow.close).toHaveBeenCalledOnce();
    });

    it('keeps window open when failed close is cancelled', async () => {
        const target = createWindow();
        const { coordinator, requests } = createHarness([target], [1]);
        const attempt = coordinator.requestWindowClose(target.browserWindow);
        coordinator.handleFlushResult(target.webContents, { requestId: requests[0].request.requestId, success: false });

        await attempt;
        expect(target.browserWindow.close).not.toHaveBeenCalled();
    });

    it('closes only after explicit Quit Without Saving', async () => {
        const target = createWindow();
        const { coordinator, requests } = createHarness([target], [2]);
        const attempt = coordinator.requestWindowClose(target.browserWindow);
        coordinator.handleFlushResult(target.webContents, { requestId: requests[0].request.requestId, success: false });

        await attempt;
        expect(target.browserWindow.close).toHaveBeenCalledOnce();
    });

    it('flushes every live renderer once for repeated application quit requests', async () => {
        const first = createWindow();
        const second = createWindow();
        const { completeApplicationQuit, coordinator, requests } = createHarness([first, second]);
        const quit = coordinator.requestApplicationQuit();
        expect(coordinator.requestApplicationQuit()).toBe(quit);
        expect(requests).toHaveLength(2);
        requests.forEach(({ request, webContents }) => {
            expect(request.reason).toBe('app-quit');
            coordinator.handleFlushResult(webContents, { requestId: request.requestId, success: true });
        });

        await quit;
        expect(completeApplicationQuit).toHaveBeenCalledOnce();
    });

    it('treats renderer destruction as failure', async () => {
        const target = createWindow();
        const { coordinator, showMessageBox } = createHarness([target], [1]);
        const attempt = coordinator.requestWindowClose(target.browserWindow);
        target.destroyRenderer();

        await attempt;
        expect(showMessageBox).toHaveBeenCalledOnce();
        expect(target.browserWindow.close).not.toHaveBeenCalled();
    });

    it('treats IPC send failure as a failed close', async () => {
        const target = createWindow();
        const showMessageBox = vi.fn(async () => ({ response: 1 }));
        const coordinator = new CloseCoordinator({
            completeApplicationQuit: vi.fn(),
            getWindows: () => [target.browserWindow],
            sendFlushRequest: () => { throw new Error('IPC unavailable'); },
            showMessageBox,
        });

        await coordinator.requestWindowClose(target.browserWindow);
        expect(showMessageBox).toHaveBeenCalledOnce();
        expect(target.browserWindow.close).not.toHaveBeenCalled();
    });

    it('treats renderer timeout as a failed close', async () => {
        vi.useFakeTimers();
        const target = createWindow();
        const { coordinator, showMessageBox } = createHarness([target], [1]);
        const attempt = coordinator.requestWindowClose(target.browserWindow);
        await vi.advanceTimersByTimeAsync(1000);
        await attempt;

        expect(showMessageBox).toHaveBeenCalledOnce();
        expect(target.browserWindow.close).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
