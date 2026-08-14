const DEFAULT_FLUSH_TIMEOUT_MS = 5000;
const FAILURE_CHOICES = { retry: 0, cancel: 1, quitWithoutSaving: 2 };

class CloseCoordinator {
    constructor(dependencies) {
        this.approvedCloses = new WeakSet();
        this.applicationQuitAttempt = null;
        this.closeAttempts = new WeakMap();
        this.dependencies = dependencies;
        this.inFlightFlushes = new WeakMap();
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
    }

    bindWindow(browserWindow) {
        browserWindow.on('close', (event) => {
            if (this.approvedCloses.has(browserWindow)) {
                this.approvedCloses.delete(browserWindow);
                return;
            }

            event.preventDefault();
            this.requestWindowClose(browserWindow);
        });
    }

    handleFlushResult(webContents, result) {
        if (!result || typeof result.requestId !== 'string' || typeof result.success !== 'boolean') return;

        const pending = this.pendingRequests.get(result.requestId);
        if (!pending || pending.webContents !== webContents) return;

        pending.settle(result.success);
    }

    requestApplicationQuit() {
        if (this.applicationQuitAttempt) return this.applicationQuitAttempt;

        this.applicationQuitAttempt = this.runApplicationQuitAttempt().finally(() => {
            this.applicationQuitAttempt = null;
        });

        return this.applicationQuitAttempt;
    }

    requestWindowClose(browserWindow) {
        if (this.applicationQuitAttempt) return this.applicationQuitAttempt;

        const existingAttempt = this.closeAttempts.get(browserWindow);
        if (existingAttempt) return existingAttempt;

        const attempt = this.runWindowCloseAttempt(browserWindow).finally(() => {
            this.closeAttempts.delete(browserWindow);
        });
        this.closeAttempts.set(browserWindow, attempt);

        return attempt;
    }

    async runApplicationQuitAttempt() {
        while (true) {
            const windows = this.dependencies.getWindows().filter((browserWindow) => !browserWindow.isDestroyed());
            const results = await Promise.all(windows.map((browserWindow) => this.flushWindow(browserWindow, 'app-quit')));
            if (results.every((success) => success)) {
                windows.forEach((browserWindow) => this.approvedCloses.add(browserWindow));
                await this.dependencies.completeApplicationQuit();
                return;
            }

            const failedWindow = windows[results.findIndex((success) => !success)] ?? null;
            const choice = await this.showFailureChoice(failedWindow);
            if (choice === FAILURE_CHOICES.retry) continue;
            if (choice === FAILURE_CHOICES.quitWithoutSaving) {
                windows.forEach((browserWindow) => this.approvedCloses.add(browserWindow));
                await this.dependencies.completeApplicationQuit();
            }
            return;
        }
    }

    async runWindowCloseAttempt(browserWindow) {
        while (!browserWindow.isDestroyed()) {
            if (await this.flushWindow(browserWindow, 'window-close')) {
                this.approvedCloses.add(browserWindow);
                browserWindow.close();
                return;
            }

            const choice = await this.showFailureChoice(browserWindow);
            if (choice === FAILURE_CHOICES.retry) continue;
            if (choice === FAILURE_CHOICES.quitWithoutSaving) {
                this.approvedCloses.add(browserWindow);
                browserWindow.close();
            }
            return;
        }
    }

    flushWindow(browserWindow, reason) {
        const existingFlush = this.inFlightFlushes.get(browserWindow);
        if (existingFlush) return existingFlush;

        const flush = this.startFlushWindow(browserWindow, reason).finally(() => {
            this.inFlightFlushes.delete(browserWindow);
        });
        this.inFlightFlushes.set(browserWindow, flush);

        return flush;
    }

    startFlushWindow(browserWindow, reason) {
        const webContents = browserWindow.webContents;
        if (webContents.isDestroyed()) return Promise.resolve(false);

        const requestId = `${reason}-${Date.now()}-${this.nextRequestId}`;
        this.nextRequestId += 1;

        return new Promise((resolve) => {
            let settled = false;
            let handleDestroyed = null;
            let timeoutId = null;
            const settle = (success) => {
                if (settled) return;

                settled = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
                if (handleDestroyed) webContents.removeListener('destroyed', handleDestroyed);
                this.pendingRequests.delete(requestId);
                resolve(success);
            };
            handleDestroyed = () => settle(false);
            timeoutId = setTimeout(() => settle(false), this.dependencies.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS);
            this.pendingRequests.set(requestId, { settle, webContents });
            webContents.once('destroyed', handleDestroyed);

            try {
                this.dependencies.sendFlushRequest(webContents, { reason, requestId });
            } catch {
                settle(false);
            }
        });
    }

    async showFailureChoice(browserWindow) {
        const options = {
            buttons: ['Retry', 'Cancel', 'Quit Without Saving'],
            cancelId: FAILURE_CHOICES.cancel,
            defaultId: FAILURE_CHOICES.retry,
            detail: 'Pending changes could not be saved. Retry saving, cancel closing, or close and discard unsaved work.',
            message: 'Could not save changes before closing',
            noLink: true,
            type: 'error',
        };
        const result = browserWindow && !browserWindow.isDestroyed()
            ? await this.dependencies.showMessageBox(browserWindow, options)
            : await this.dependencies.showMessageBox(options);

        return result.response;
    }
}

module.exports = { CloseCoordinator, DEFAULT_FLUSH_TIMEOUT_MS, FAILURE_CHOICES };
