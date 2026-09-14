import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    DOWNLOAD_HIGH_WATER_MARK,
    MAX_REDIRECTS,
    UpdateService,
    downloadToFile,
    fetchLatestRelease,
    findInstallerAsset,
    isNewerVersion,
    parseVersion,
    registerUpdateBridge,
} = require('./update_service');

function createHttpsStub(handler) {
    return {
        get: (url, options, callback) => {
            const request = new EventEmitter();
            queueMicrotask(() => handler({ callback, options, request, url }));

            return request;
        },
    };
}

function createResponse({ chunks = [], headers = {}, statusCode = 200 } = {}) {
    const response = new EventEmitter();
    response.headers = headers;
    response.statusCode = statusCode;
    response.resume = vi.fn();
    response.setEncoding = vi.fn();
    response.emitBody = () => {
        chunks.forEach((chunk) => response.emit('data', chunk));
        response.emit('end');
    };
    response.pipe = (writable) => {
        chunks.forEach((chunk) => {
            response.emit('data', chunk);
            writable.write(chunk);
        });
        writable.end();
    };

    return response;
}

function createWriteStream() {
    const stream = new EventEmitter();
    stream.write = vi.fn(() => true);
    stream.end = vi.fn(() => queueMicrotask(() => stream.emit('finish')));

    return stream;
}

function createFileSystem() {
    return {
        createWriteStream: vi.fn(() => createWriteStream()),
        promises: { rm: vi.fn().mockResolvedValue(undefined) },
    };
}

function createRelease(version = '0.6.0', assets = null) {
    return JSON.stringify({
        assets: assets ?? [{
            browser_download_url: `https://github.test/MD2-Setup-${version}-x64.exe`,
            name: `MD2-Setup-${version}-x64.exe`,
        }],
        tag_name: `v${version}`,
    });
}

function createUpdateService(overrides = {}) {
    const dependencies = {
        app: { getVersion: () => '0.5.3', isPackaged: true },
        fs: createFileSystem(),
        https: createHttpsStub(({ callback }) => {
            const response = createResponse({ chunks: [createRelease()] });
            callback(response);
            queueMicrotask(() => response.emitBody());
        }),
        os: { tmpdir: () => 'C:\\Temp' },
        requestApplicationQuit: vi.fn().mockResolvedValue(undefined),
        shell: { openPath: vi.fn().mockResolvedValue('') },
        ...overrides,
    };

    return { dependencies, service: new UpdateService(dependencies) };
}

describe('numeric version handling', () => {
    it('parses only numeric dot-separated versions', () => {
        expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
        expect(parseVersion('1.2-beta')).toEqual([]);
        expect(parseVersion('release-1.2')).toEqual([]);
    });

    it('requires a strictly newer valid version', () => {
        expect(isNewerVersion('0.5.4', '0.5.3')).toBe(true);
        expect(isNewerVersion('0.5.3.1', '0.5.3')).toBe(true);
        expect(isNewerVersion('0.5.3', '0.5.3')).toBe(false);
        expect(isNewerVersion('0.5.2', '0.5.3')).toBe(false);
        expect(isNewerVersion('invalid', '0.5.3')).toBe(false);
    });
});

describe('release selection', () => {
    it('selects only exact Windows x64 installer name for release version', () => {
        const expectedAsset = {
            browser_download_url: 'https://x/MD2-Setup-0.6.0-x64.exe',
            name: 'MD2-Setup-0.6.0-x64.exe',
        };
        const assets = [
            { browser_download_url: 'https://x/MD2-Setup-0.6.0.exe', name: 'MD2-Setup-0.6.0.exe' },
            { browser_download_url: 'https://x/MD2-Setup-0.6.0-arm64.exe', name: 'MD2-Setup-0.6.0-arm64.exe' },
            expectedAsset,
        ];

        expect(findInstallerAsset(assets, '0.6.0')).toBe(expectedAsset);
        expect(findInstallerAsset(assets, '0.6.1')).toBeNull();
    });

    it('rejects malformed releases and insecure installer URLs', async () => {
        const malformedHttps = createHttpsStub(({ callback }) => {
            const response = createResponse({ chunks: [createRelease('0.6-beta')] });
            callback(response);
            queueMicrotask(() => response.emitBody());
        });
        const insecureAssets = [{
            browser_download_url: 'http://x/MD2-Setup-0.6.0-x64.exe',
            name: 'MD2-Setup-0.6.0-x64.exe',
        }];

        await expect(fetchLatestRelease({ https: malformedHttps })).resolves.toBeNull();
        expect(findInstallerAsset(insecureAssets, '0.6.0')).toBeNull();
    });
});

describe('downloadToFile', () => {
    it('reports known progress and uses configured write buffer', async () => {
        const fs = createFileSystem();
        const https = createHttpsStub(({ callback }) => callback(createResponse({
            chunks: [Buffer.from('ab'), Buffer.from('cd')],
            headers: { 'content-length': '4' },
        })));
        const progress = [];

        await downloadToFile({
            downloadUrl: 'https://x/installer.exe',
            filePath: 'C:\\Temp\\installer.exe',
            fs,
            https,
            onProgress: (snapshot) => progress.push(snapshot),
        });

        expect(fs.createWriteStream).toHaveBeenCalledWith('C:\\Temp\\installer.exe', { highWaterMark: DOWNLOAD_HIGH_WATER_MARK });
        expect(progress).toEqual([{ received: 2, total: 4 }, { received: 4, total: 4 }]);
    });

    it('reports unknown total and stops after maximum redirects', async () => {
        const fs = createFileSystem();
        const progress = [];
        const successfulHttps = createHttpsStub(({ callback }) => callback(createResponse({ chunks: [Buffer.from('x')] })));

        await downloadToFile({
            downloadUrl: 'https://x/installer.exe',
            filePath: 'C:\\Temp\\installer.exe',
            fs,
            https: successfulHttps,
            onProgress: (snapshot) => progress.push(snapshot),
        });
        expect(progress).toEqual([{ received: 1, total: null }]);

        let requests = 0;
        const redirectingHttps = createHttpsStub(({ callback }) => {
            requests += 1;
            callback(createResponse({ headers: { location: '/next' }, statusCode: 302 }));
        });
        await expect(downloadToFile({
            downloadUrl: 'https://x/installer.exe',
            filePath: 'C:\\Temp\\installer.exe',
            fs,
            https: redirectingHttps,
            onProgress: vi.fn(),
        })).rejects.toThrow('Too many redirects');
        expect(requests).toBe(MAX_REDIRECTS + 1);
    });
});

describe('UpdateService', () => {
    it('checks once only in packaged mode and stores available snapshot', async () => {
        const { service } = createUpdateService();
        const changed = vi.fn();
        service.addEventListener('changed', changed);

        await service.checkForUpdate();
        await service.checkForUpdate();

        expect(service.getSnapshot()).toEqual({ error: null, received: 0, state: 'available', total: null, version: '0.6.0' });
        expect(changed).toHaveBeenCalledOnce();

        const https = createHttpsStub(() => {
            throw new Error('Development must not request release data');
        });
        const development = createUpdateService({
            app: { getVersion: () => '0.5.3', isPackaged: false },
            https,
        }).service;
        await expect(development.checkForUpdate()).resolves.toBeUndefined();
    });

    it('dismisses current release for remaining service lifetime', async () => {
        const { service } = createUpdateService();
        await service.checkForUpdate();

        service.dismiss();
        await service.checkForUpdate();
        await service.install();

        expect(service.getSnapshot().state).toBe('idle');
    });

    it('downloads once, reports progress, launches, then requests coordinated shutdown', async () => {
        const releaseBody = createRelease();
        let requestCount = 0;
        const https = createHttpsStub(({ callback }) => {
            requestCount += 1;
            if (requestCount === 1) {
                const response = createResponse({ chunks: [releaseBody] });
                callback(response);
                queueMicrotask(() => response.emitBody());
                return;
            }
            callback(createResponse({
                chunks: [Buffer.from('ab'), Buffer.from('cd')],
                headers: { 'content-length': '4' },
            }));
        });
        const { dependencies, service } = createUpdateService({ https });

        await service.checkForUpdate();
        const firstInstall = service.install();
        await service.install();
        await firstInstall;

        expect(requestCount).toBe(2);
        expect(dependencies.shell.openPath).toHaveBeenCalledOnce();
        expect(dependencies.requestApplicationQuit).toHaveBeenCalledOnce();
        expect(service.getSnapshot()).toEqual({ error: null, received: 4, state: 'launching', total: 4, version: '0.6.0' });
    });

    it('removes partial file and exposes retry state after download failure', async () => {
        const releaseBody = createRelease();
        let requestCount = 0;
        const https = createHttpsStub(({ callback, request }) => {
            requestCount += 1;
            if (requestCount === 1) {
                const response = createResponse({ chunks: [releaseBody] });
                callback(response);
                queueMicrotask(() => response.emitBody());
                return;
            }
            request.emit('error', new Error('interrupted'));
        });
        const { dependencies, service } = createUpdateService({ https });

        await service.checkForUpdate();
        await service.install();

        expect(service.getSnapshot()).toEqual({
            error: 'Could not install version 0.6.0. Try again.',
            received: 0,
            state: 'error',
            total: null,
            version: '0.6.0',
        });
        expect(dependencies.fs.promises.rm).toHaveBeenCalledWith(expect.stringContaining('md2-update-0.6.0-'), { force: true });
        expect(dependencies.shell.openPath).not.toHaveBeenCalled();
        expect(dependencies.requestApplicationQuit).not.toHaveBeenCalled();
    });

    it('treats non-empty launch result as failure, cleans up, and allows retry', async () => {
        const releaseBody = createRelease();
        let requestCount = 0;
        const https = createHttpsStub(({ callback }) => {
            requestCount += 1;
            if (requestCount === 1) {
                const response = createResponse({ chunks: [releaseBody] });
                callback(response);
                queueMicrotask(() => response.emitBody());
                return;
            }
            callback(createResponse({ chunks: [Buffer.from('x')] }));
        });
        const shell = { openPath: vi.fn().mockResolvedValueOnce('Access denied').mockResolvedValueOnce('') };
        const { dependencies, service } = createUpdateService({ https, shell });

        await service.checkForUpdate();
        await service.install();
        expect(service.getSnapshot().state).toBe('error');
        expect(dependencies.requestApplicationQuit).not.toHaveBeenCalled();

        await service.install();
        expect(shell.openPath).toHaveBeenCalledTimes(2);
        expect(dependencies.requestApplicationQuit).toHaveBeenCalledOnce();
    });

    it('keeps startup check failures silent', async () => {
        const https = createHttpsStub(({ request }) => request.emit('error', new Error('offline')));
        const { service } = createUpdateService({ https });
        const changed = vi.fn();
        service.addEventListener('changed', changed);

        await service.checkForUpdate();

        expect(service.getSnapshot().state).toBe('idle');
        expect(changed).not.toHaveBeenCalled();
    });
});

describe('registerUpdateBridge', () => {
    it('serves current snapshot and forwards parameterless operations', async () => {
        const handlers = new Map();
        const ipcMain = { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) };
        const updateService = new EventTarget();
        updateService.dismiss = vi.fn();
        updateService.getSnapshot = vi.fn(() => ({ state: 'idle' }));
        updateService.install = vi.fn().mockResolvedValue(undefined);
        const send = vi.fn();

        registerUpdateBridge({
            getWindow: () => ({ webContents: { isDestroyed: () => false, send } }),
            ipcMain,
            updateService,
        });

        expect(handlers.get('md2-update:get-snapshot')()).toEqual({ state: 'idle' });
        handlers.get('md2-update:dismiss')({}, { downloadUrl: 'https://evil.test/installer.exe' });
        await handlers.get('md2-update:install')({}, { downloadUrl: 'https://evil.test/installer.exe' });
        updateService.dispatchEvent(new CustomEvent('changed', { detail: { state: 'available', version: '0.6.0' } }));

        expect(updateService.dismiss).toHaveBeenCalledWith();
        expect(updateService.install).toHaveBeenCalledWith();
        expect(send).toHaveBeenCalledWith('md2-update:changed', { state: 'available', version: '0.6.0' });
    });
});
