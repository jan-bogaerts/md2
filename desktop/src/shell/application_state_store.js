const APPLICATION_STATE_STORE_NAME = 'application-state';
const {
    APPLICATION_STATE_READ_CHANNEL,
    APPLICATION_STATE_REMOVE_CHANNEL,
    APPLICATION_STATE_WRITE_CHANNEL,
} = require('./ipc_channels');

function requireKey(key) {
    if (typeof key !== 'string' || key.length === 0) throw new Error('Application-state key is required');

    return key;
}

function requireValue(value) {
    if (typeof value !== 'string') throw new Error('Application-state value must be a string');

    return value;
}

/** Create renderer application persistence separately from desktop configuration. */
function createApplicationStateStore(Store) {
    return new Store({ accessPropertiesByDotNotation: false, name: APPLICATION_STATE_STORE_NAME });
}

function readApplicationState(store, key) {
    if (key === null) return store.store;

    return store.get(requireKey(key), null);
}

function writeApplicationState(store, key, value) {
    const storedKey = requireKey(key);
    const storedValue = requireValue(value);
    store.set(storedKey, storedValue);

    return storedValue;
}

function removeApplicationState(store, key) {
    store.delete(requireKey(key));
}

function registerApplicationStateBridge(ipcMain, store) {
    ipcMain.handle(APPLICATION_STATE_READ_CHANNEL, (_event, key) => readApplicationState(store, key));
    ipcMain.handle(APPLICATION_STATE_WRITE_CHANNEL, (_event, key, value) => writeApplicationState(store, key, value));
    ipcMain.handle(APPLICATION_STATE_REMOVE_CHANNEL, (_event, key) => removeApplicationState(store, key));
}

module.exports = {
    APPLICATION_STATE_STORE_NAME,
    createApplicationStateStore,
    readApplicationState,
    registerApplicationStateBridge,
    removeApplicationState,
    writeApplicationState,
};
