import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    checkForUpdate,
    fetchLatestRelease,
    findInstallerAsset,
    handleDownloadRequest,
    isNewerVersion,
    parseVersion,
} = require('./update_service');

/** Minimal https.get stub that replays a canned response object. */
function createHttpsStub(handler) {
    return {
        get: (url, options, callback) => {
            const request = new EventEmitter();
            // Support both get(url, cb) and get(url, options, cb) forms.
            const done = typeof options === 'function' ? options : callback;
            queueMicrotask(() => handler({ done, request, url }));

            return request;
        },
    };
}

function createResponse({ statusCode = 200, headers = {}, chunks = [] } = {}) {
    const response = new EventEmitter();
    response.statusCode = statusCode;
    response.headers = headers;
    response.setEncoding = () => undefined;
    response.resume = () => undefined;
    response.pipe = (writable) => {
        for (const chunk of chunks) writable.write(chunk);
        writable.end();
    };
    response.emitBody = () => {
        for (const chunk of chunks) response.emit('data', chunk);
        response.emit('end');
    };

    return response;
}

describe('parseVersion / isNewerVersion', () => {
    it('strips a leading v and parses numeric segments', () => {
        expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
    });

    it('compares versions segment by segment', () => {
        expect(isNewerVersion('0.3.0', '0.2.0')).toBe(true);
        expect(isNewerVersion('0.2.10', '0.2.9')).toBe(true);
        expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
        expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false);
        expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
    });
});

describe('findInstallerAsset', () => {
    it('returns the .exe asset and ignores others', () => {
        const assets = [
            { browser_download_url: 'https://x/notes.txt' },
            { browser_download_url: 'https://x/md2-Setup-0.3.0.exe' },
        ];

        expect(findInstallerAsset(assets)?.browser_download_url).toBe('https://x/md2-Setup-0.3.0.exe');
    });

    it('returns null when no installer is present', () => {
        expect(findInstallerAsset([{ browser_download_url: 'https://x/app.zip' }])).toBeNull();
        expect(findInstallerAsset(undefined)).toBeNull();
    });
});

describe('fetchLatestRelease', () => {
    it('parses tag_name and installer asset', async () => {
        const release = JSON.stringify({
            assets: [{ browser_download_url: 'https://x/md2-Setup-0.3.0.exe' }],
            tag_name: 'v0.3.0',
        });
        const https = createHttpsStub(({ done }) => {
            const response = createResponse({ chunks: [release] });
            done(response);
            response.emitBody();
        });

        await expect(fetchLatestRelease({ https })).resolves.toEqual({
            downloadUrl: 'https://x/md2-Setup-0.3.0.exe',
            version: '0.3.0',
        });
    });

    it('rejects on non-2xx status', async () => {
        const https = createHttpsStub(({ done }) => done(createResponse({ statusCode: 404 })));

        await expect(fetchLatestRelease({ https })).rejects.toThrow('Unexpected status 404');
    });
});

describe('checkForUpdate', () => {
    it('does nothing in dev mode', async () => {
        const send = vi.fn();
        const https = createHttpsStub(() => {
            throw new Error('should not be called');
        });

        await checkForUpdate({
            app: { getVersion: () => '0.2.0', isPackaged: false },
            getWindow: () => ({ webContents: { send } }),
            https,
        });

        expect(send).not.toHaveBeenCalled();
    });

    it('notifies the renderer when a newer release exists', async () => {
        const send = vi.fn();
        const release = JSON.stringify({
            assets: [{ browser_download_url: 'https://x/md2.exe' }],
            tag_name: 'v0.3.0',
        });
        const https = createHttpsStub(({ done }) => {
            const response = createResponse({ chunks: [release] });
            done(response);
            response.emitBody();
        });

        await checkForUpdate({
            app: { getVersion: () => '0.2.0', isPackaged: true },
            getWindow: () => ({ webContents: { isDestroyed: () => false, send } }),
            https,
        });

        expect(send).toHaveBeenCalledWith('md2-update:available', { downloadUrl: 'https://x/md2.exe', version: '0.3.0' });
    });

    it('stays silent when already on the latest version', async () => {
        const send = vi.fn();
        const release = JSON.stringify({
            assets: [{ browser_download_url: 'https://x/md2.exe' }],
            tag_name: 'v0.2.0',
        });
        const https = createHttpsStub(({ done }) => {
            const response = createResponse({ chunks: [release] });
            done(response);
            response.emitBody();
        });

        await checkForUpdate({
            app: { getVersion: () => '0.2.0', isPackaged: true },
            getWindow: () => ({ webContents: { isDestroyed: () => false, send } }),
            https,
        });

        expect(send).not.toHaveBeenCalled();
    });

    it('swallows network errors', async () => {
        const send = vi.fn();
        const https = createHttpsStub(({ request }) => request.emit('error', new Error('offline')));

        await expect(checkForUpdate({
            app: { getVersion: () => '0.2.0', isPackaged: true },
            getWindow: () => ({ webContents: { isDestroyed: () => false, send } }),
            https,
        })).resolves.toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });
});

describe('handleDownloadRequest', () => {
    function createWriteStream() {
        const stream = new EventEmitter();
        stream.write = () => true;
        stream.end = () => queueMicrotask(() => stream.emit('finish'));

        return stream;
    }

    it('streams progress with a 4 MB buffer, launches the installer, and quits', async () => {
        const highWaterMarks = [];
        const fs = { createWriteStream: (_path, options) => {
            highWaterMarks.push(options?.highWaterMark);

            return createWriteStream();
        } };
        const progress = [];
        const send = vi.fn((_channel, payload) => progress.push(payload));
        const openPath = vi.fn().mockResolvedValue('');
        const quit = vi.fn();
        const https = createHttpsStub(({ done }) => {
            const response = createResponse({ chunks: ['ab', 'cd'], headers: { 'content-length': '4' } });
            done(response);
            queueMicrotask(() => response.emitBody());
        });

        await handleDownloadRequest({
            app: { quit },
            downloadUrl: 'https://x/md2.exe',
            fs,
            getWindow: () => ({ webContents: { isDestroyed: () => false, send } }),
            https,
            os: { tmpdir: () => '/tmp' },
            shell: { openPath },
        });

        expect(highWaterMarks).toEqual([4 * 1024 * 1024]);
        expect(progress).toEqual([{ received: 2, total: 4 }, { received: 4, total: 4 }]);
        expect(openPath).toHaveBeenCalledTimes(1);
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('follows a redirect before downloading', async () => {
        const fs = { createWriteStream: () => createWriteStream() };
        const quit = vi.fn();
        const openPath = vi.fn().mockResolvedValue('');
        const urls = [];
        const https = createHttpsStub(({ done, url }) => {
            urls.push(url);
            if (urls.length === 1) {
                done(createResponse({ headers: { location: 'https://cdn/md2.exe' }, statusCode: 302 }));

                return;
            }
            const response = createResponse({ chunks: ['x'], headers: { 'content-length': '1' } });
            done(response);
            queueMicrotask(() => response.emitBody());
        });

        await handleDownloadRequest({
            app: { quit },
            downloadUrl: 'https://x/md2.exe',
            fs,
            getWindow: () => ({ webContents: { isDestroyed: () => false, send: vi.fn() } }),
            https,
            os: { tmpdir: () => '/tmp' },
            shell: { openPath },
        });

        expect(urls).toEqual(['https://x/md2.exe', 'https://cdn/md2.exe']);
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('swallows download errors without quitting', async () => {
        const fs = { createWriteStream: () => createWriteStream() };
        const quit = vi.fn();
        const https = createHttpsStub(({ request }) => request.emit('error', new Error('interrupted')));

        await expect(handleDownloadRequest({
            app: { quit },
            downloadUrl: 'https://x/md2.exe',
            fs,
            getWindow: () => ({ webContents: { isDestroyed: () => false, send: vi.fn() } }),
            https,
            os: { tmpdir: () => '/tmp' },
            shell: { openPath: vi.fn() },
        })).resolves.toBeUndefined();
        expect(quit).not.toHaveBeenCalled();
    });
});
