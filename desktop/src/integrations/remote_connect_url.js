/**
 * Builds the stable URL for the Electron-served web app.
 */
function buildConnectUrl(host, port) {
    return `http://${host}:${port}/`;
}

module.exports = { buildConnectUrl };
