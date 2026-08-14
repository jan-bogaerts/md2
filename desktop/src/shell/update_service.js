const nodeHttps = require('node:https');
const nodeFs = require('node:fs');
const nodeOs = require('node:os');
const path = require('node:path');

const {
    UPDATE_AVAILABLE_CHANNEL,
    UPDATE_DOWNLOAD_CHANNEL,
    UPDATE_PROGRESS_CHANNEL,
} = require('./ipc_channels');

const LATEST_RELEASE_URL = 'https://api.github.com/repos/jan-bogaerts/md2/releases/latest';
// GitHub rejects API requests without a User-Agent; use a stable app identifier.
const USER_AGENT = 'md2-desktop-update-check';
// 4 MB write buffer keeps a large installer download from being throttled by tiny chunk flushes.
const DOWNLOAD_HIGH_WATER_MARK = 4 * 1024 * 1024;
// Follow at most a few redirects (GitHub asset URLs 302 to a CDN host).
const MAX_REDIRECTS = 5;

/** Split a version string into numeric segments, tolerating a leading `v` and non-numeric noise. */
function parseVersion(value) {
    if (typeof value !== 'string') return [];

    return value
        .trim()
        .replace(/^v/i, '')
        .split('.')
        .map((segment) => Number.parseInt(segment, 10))
        .map((segment) => (Number.isFinite(segment) ? segment : 0));
}

/** True when `latest` is a strictly higher version than `current` (segment-by-segment numeric compare). */
function isNewerVersion(latest, current) {
    const latestSegments = parseVersion(latest);
    const currentSegments = parseVersion(current);
    const length = Math.max(latestSegments.length, currentSegments.length);

    for (let index = 0; index < length; index += 1) {
        const latestSegment = latestSegments[index] ?? 0;
        const currentSegment = currentSegments[index] ?? 0;
        if (latestSegment > currentSegment) return true;
        if (latestSegment < currentSegment) return false;
    }

    return false;
}

/** Pick the NSIS installer asset (its download URL ends in `.exe`) from a GitHub release's assets array. */
function findInstallerAsset(assets) {
    if (!Array.isArray(assets)) return null;

    return assets.find((asset) => typeof asset?.browser_download_url === 'string'
        && asset.browser_download_url.toLowerCase().endsWith('.exe')) ?? null;
}

/** GET a URL over HTTPS and resolve the fully-buffered response body as a string. */
function fetchJsonBody(url, { https }) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT } }, (response) => {
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
                response.resume();
                reject(new Error(`Unexpected status ${status}`));

                return;
            }

            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => resolve(body));
            response.on('error', reject);
        });
        request.on('error', reject);
    });
}

/** Fetch and parse the latest GitHub release. Returns `{ version, downloadUrl }` or null when no installer asset. */
async function fetchLatestRelease({ https = nodeHttps } = {}) {
    const body = await fetchJsonBody(LATEST_RELEASE_URL, { https });
    const release = JSON.parse(body);
    const asset = findInstallerAsset(release?.assets);
    if (!release?.tag_name || !asset) return null;

    return { downloadUrl: asset.browser_download_url, version: release.tag_name.replace(/^v/i, '') };
}

/**
 * On startup, check GitHub for a newer release and notify the renderer. No-op in dev mode.
 * Every failure (offline, API error, malformed JSON) is swallowed so startup is never disrupted.
 */
async function checkForUpdate({ app, https = nodeHttps, getWindow }) {
    try {
        if (!app.isPackaged) return;

        const latest = await fetchLatestRelease({ https });
        if (!latest) return;
        if (!isNewerVersion(latest.version, app.getVersion())) return;

        const window = getWindow();
        if (!window || window.isDestroyed?.() || window.webContents?.isDestroyed?.()) return;

        window.webContents.send(UPDATE_AVAILABLE_CHANNEL, latest);
    } catch {
        // Update checks are best-effort; never surface an error to the user.
    }
}

/** Stream `downloadUrl` (following redirects) into `filePath`, reporting progress via `onProgress`. */
function downloadToFile({ downloadUrl, filePath, https, fs, onProgress }) {
    return new Promise((resolve, reject) => {
        const get = (url, redirectsLeft) => {
            const request = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
                const status = response.statusCode ?? 0;
                if (status >= 300 && status < 400 && response.headers?.location) {
                    response.resume();
                    if (redirectsLeft <= 0) {
                        reject(new Error('Too many redirects'));

                        return;
                    }
                    get(new URL(response.headers.location, url).toString(), redirectsLeft - 1);

                    return;
                }
                if (status < 200 || status >= 300) {
                    response.resume();
                    reject(new Error(`Unexpected status ${status}`));

                    return;
                }

                const total = Number.parseInt(response.headers?.['content-length'] ?? '', 10) || 0;
                let received = 0;
                const fileStream = fs.createWriteStream(filePath, { highWaterMark: DOWNLOAD_HIGH_WATER_MARK });

                response.on('data', (chunk) => {
                    received += chunk.length;
                    onProgress({ received, total });
                });
                response.on('error', reject);
                fileStream.on('error', reject);
                fileStream.on('finish', () => resolve());
                response.pipe(fileStream);
            });
            request.on('error', reject);
        };

        get(downloadUrl, MAX_REDIRECTS);
    });
}

/**
 * Download the installer to a temp file, streaming progress to the renderer, then launch it and quit.
 * Errors are swallowed so a failed download leaves the running app untouched.
 */
async function handleDownloadRequest({ downloadUrl, app, shell, getWindow, https = nodeHttps, fs = nodeFs, os = nodeOs }) {
    try {
        if (!downloadUrl) return;

        const filePath = path.join(os.tmpdir(), `md2-update-${Date.now()}.exe`);
        const onProgress = (progress) => {
            const window = getWindow();
            if (!window || window.isDestroyed?.() || window.webContents?.isDestroyed?.()) return;
            window.webContents.send(UPDATE_PROGRESS_CHANNEL, progress);
        };

        await downloadToFile({ downloadUrl, filePath, fs, https, onProgress });
        await shell.openPath(filePath);
        app.quit();
    } catch {
        // Download/launch failures are non-fatal; keep the current app running.
    }
}

/** Register the IPC handler the renderer invokes (with `{ downloadUrl }`) to start the installer download. */
function registerUpdateDownload({ ipcMain, app, shell, getWindow, https = nodeHttps, fs = nodeFs, os = nodeOs }) {
    ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, (_event, request) => handleDownloadRequest({
        app,
        downloadUrl: request?.downloadUrl,
        fs,
        getWindow,
        https,
        os,
        shell,
    }));
}

module.exports = {
    checkForUpdate,
    fetchLatestRelease,
    findInstallerAsset,
    handleDownloadRequest,
    isNewerVersion,
    parseVersion,
    registerUpdateDownload,
};
