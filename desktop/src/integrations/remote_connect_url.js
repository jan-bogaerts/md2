/**
 * Builds the self-contained connect URL for the Electron-served web app: the page URL with the
 * session token in the fragment. Opening it in a LAN browser loads the app and auto-connects, and
 * the web connect dialog parses the same string in one paste (see F-043 / F-045).
 */
function buildConnectUrl(host, port, token) {
    return `http://${host}:${port}/#${token}`;
}

module.exports = { buildConnectUrl };
