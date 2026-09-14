const nodeFs = require('node:fs');
const nodeHttps = require('node:https');
const nodeOs = require('node:os');
const path = require('node:path');

const {
    UPDATE_CHANGED_CHANNEL,
    UPDATE_DISMISS_CHANNEL,
    UPDATE_GET_SNAPSHOT_CHANNEL,
    UPDATE_INSTALL_CHANNEL,
} = require('./ipc_channels');

const LATEST_RELEASE_URL = 'https://api.github.com/repos/jan-bogaerts/md2/releases/latest';
const USER_AGENT = 'md2-desktop-update-check';
const DOWNLOAD_HIGH_WATER_MARK = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const UPDATE_CHANGED_EVENT = 'changed';
const INITIAL_SNAPSHOT = Object.freeze({ error: null, received: 0, state: 'idle', total: null, version: null });

/** Parse a version containing only numeric dot-separated segments and an optional leading `v`. */
function parseVersion(value) {
    if (typeof value !== 'string') return [];

    const normalized = value.trim().replace(/^v/i, '');
    if (!/^\d+(?:\.\d+)*$/.test(normalized)) return [];

    return normalized.split('.').map((segment) => Number.parseInt(segment, 10));
}

/** True when `latest` is a strictly higher numeric version than `current`. */
function isNewerVersion(latest, current) {
    const latestSegments = parseVersion(latest);
    const currentSegments = parseVersion(current);
    if (latestSegments.length === 0 || currentSegments.length === 0) return false;

    const length = Math.max(latestSegments.length, currentSegments.length);
    for (let index = 0; index < length; index += 1) {
        const latestSegment = latestSegments[index] ?? 0;
        const currentSegment = currentSegments[index] ?? 0;
        if (latestSegment > currentSegment) return true;
        if (latestSegment < currentSegment) return false;
    }

    return false;
}

/** Select only the Windows x64 installer produced for the release version. */
function findInstallerAsset(assets, version) {
    if (!Array.isArray(assets) || parseVersion(version).length === 0) return null;

    const expectedName = `MD2-Setup-${version}-x64.exe`;

    return assets.find((asset) => asset?.name === expectedName
        && typeof asset.browser_download_url === 'string'
        && asset.browser_download_url.startsWith('https://')) ?? null;
}

/** GET a URL and resolve its response, rejecting request failures. */
function requestHttpsResponse(url, headers, https) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers }, resolve);
        request.on('error', reject);
    });
}

/** Fetch a UTF-8 HTTPS response body. */
async function fetchJsonBody(url, { https }) {
    const response = await requestHttpsResponse(url, {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
    }, https);
    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
        response.resume();
        throw new Error(`Unexpected status ${status}`);
    }

    return new Promise((resolve, reject) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            body += chunk;
        });
        response.on('end', () => resolve(body));
        response.on('error', reject);
    });
}

/** Fetch and validate latest release metadata. */
async function fetchLatestRelease({ https = nodeHttps } = {}) {
    const body = await fetchJsonBody(LATEST_RELEASE_URL, { https });
    const release = JSON.parse(body);
    const versionSegments = parseVersion(release?.tag_name);
    if (versionSegments.length === 0) return null;

    const version = release.tag_name.trim().replace(/^v/i, '');
    const asset = findInstallerAsset(release.assets, version);
    if (!asset) return null;

    return { downloadUrl: asset.browser_download_url, version };
}

/** Resolve final download response while following no more than configured redirect count. */
async function requestDownloadResponse(downloadUrl, https) {
    let currentUrl = downloadUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const response = await requestHttpsResponse(currentUrl, { 'User-Agent': USER_AGENT }, https);
        const status = response.statusCode ?? 0;
        const location = response.headers?.location;
        if (status >= 300 && status < 400 && location) {
            response.resume();
            if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');

            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }
        if (status < 200 || status >= 300) {
            response.resume();
            throw new Error(`Unexpected status ${status}`);
        }

        return response;
    }

    throw new Error('Too many redirects');
}

/** Stream response bytes into a file and report cumulative progress. */
function streamResponseToFile({ filePath, fs, onProgress, response }) {
    return new Promise((resolve, reject) => {
        const parsedTotal = Number.parseInt(response.headers?.['content-length'] ?? '', 10);
        const total = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;
        const fileStream = fs.createWriteStream(filePath, { highWaterMark: DOWNLOAD_HIGH_WATER_MARK });
        let received = 0;
        let settled = false;
        const settle = (error) => {
            if (settled) return;

            settled = true;
            if (error) reject(error);
            else resolve();
        };

        response.on('data', (chunk) => {
            received += chunk.length;
            onProgress({ received, total });
        });
        response.on('error', settle);
        fileStream.on('error', settle);
        fileStream.on('finish', () => settle());
        response.pipe(fileStream);
    });
}

/** Stream a trusted installer URL into a local file with bounded redirects. */
async function downloadToFile({ downloadUrl, filePath, https, fs, onProgress }) {
    const response = await requestDownloadResponse(downloadUrl, https);
    await streamResponseToFile({ filePath, fs, onProgress, response });
}

/** Electron-owned application update state and installer lifecycle. */
class UpdateService extends EventTarget {
    constructor({ app, fs = nodeFs, https = nodeHttps, os = nodeOs, requestApplicationQuit, shell }) {
        super();
        this.app = app;
        this.candidate = null;
        this.checkStarted = false;
        this.fs = fs;
        this.https = https;
        this.os = os;
        this.requestApplicationQuit = requestApplicationQuit;
        this.shell = shell;
        this.snapshot = INITIAL_SNAPSHOT;
    }

    getSnapshot() {
        return this.snapshot;
    }

    async checkForUpdate() {
        if (this.checkStarted || !this.app.isPackaged) return;

        this.checkStarted = true;
        try {
            const latest = await fetchLatestRelease({ https: this.https });
            if (!latest || !isNewerVersion(latest.version, this.app.getVersion())) return;

            this.candidate = latest;
            this.setSnapshot({ error: null, received: 0, state: 'available', total: null, version: latest.version });
        } catch {
            // Startup checks stay silent and leave update state idle.
        }
    }

    dismiss() {
        if (!this.candidate) return;

        this.candidate = null;
        this.setSnapshot(INITIAL_SNAPSHOT);
    }

    async install() {
        if (!this.candidate || !['available', 'error'].includes(this.snapshot.state)) return;

        const { downloadUrl, version } = this.candidate;
        const filePath = path.join(this.os.tmpdir(), `md2-update-${version}-${Date.now()}.exe`);
        this.setSnapshot({ error: null, received: 0, state: 'downloading', total: null, version });

        try {
            const onProgress = ({ received, total }) => {
                this.setSnapshot({ error: null, received, state: 'downloading', total, version });
            };
            await downloadToFile({ downloadUrl, filePath, fs: this.fs, https: this.https, onProgress });
            this.setSnapshot({ error: null, received: this.snapshot.received, state: 'launching', total: this.snapshot.total, version });
            const launchError = await this.shell.openPath(filePath);
            if (launchError) throw new Error(launchError);

            await this.requestApplicationQuit();
        } catch {
            await this.removeTemporaryFile(filePath);
            this.setSnapshot({
                error: `Could not install version ${version}. Try again.`,
                received: 0,
                state: 'error',
                total: null,
                version,
            });
        }
    }

    async removeTemporaryFile(filePath) {
        try {
            await this.fs.promises.rm(filePath, { force: true });
        } catch {
            // Cleanup failure must not replace actionable install failure state.
        }
    }

    setSnapshot(snapshot) {
        this.snapshot = snapshot;
        this.dispatchEvent(new CustomEvent(UPDATE_CHANGED_EVENT, { detail: snapshot }));
    }
}

/** Expose only scoped update operations and publish service snapshots to renderer. */
function registerUpdateBridge({ getWindow, ipcMain, updateService }) {
    ipcMain.handle(UPDATE_GET_SNAPSHOT_CHANNEL, () => updateService.getSnapshot());
    ipcMain.handle(UPDATE_DISMISS_CHANNEL, () => updateService.dismiss());
    ipcMain.handle(UPDATE_INSTALL_CHANNEL, () => updateService.install());
    updateService.addEventListener(UPDATE_CHANGED_EVENT, (event) => {
        const window = getWindow();
        if (!window || window.isDestroyed?.() || window.webContents?.isDestroyed?.()) return;

        window.webContents.send(UPDATE_CHANGED_CHANNEL, event.detail);
    });
}

module.exports = {
    DOWNLOAD_HIGH_WATER_MARK,
    INITIAL_SNAPSHOT,
    MAX_REDIRECTS,
    UPDATE_CHANGED_EVENT,
    UpdateService,
    downloadToFile,
    fetchLatestRelease,
    findInstallerAsset,
    isNewerVersion,
    parseVersion,
    registerUpdateBridge,
};
