const { serializeBridgeError } = require('../../../shared/bridge_errors.mjs');

/**
 * Invoke a bridge method and resolve with an error envelope when it fails.
 *
 * Electron serializes a rejected `ipcMain.handle` result by message only, which drops marker
 * properties such as `code` and `workingFolder`. Resolving with an envelope keeps them intact,
 * and the renderer turns the envelope back into a typed error.
 */
async function invokeWithErrorEnvelope(invoke) {
    try {
        return await invoke();
    } catch (error) {
        return serializeBridgeError(error);
    }
}

module.exports = { invokeWithErrorEnvelope };
