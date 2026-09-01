const { contextBridge, ipcRenderer, webUtils } = require('electron');

const APPLICATION_STATE_READ_CHANNEL = 'md2-application-state:read';
const APPLICATION_STATE_REMOVE_CHANNEL = 'md2-application-state:remove';
const APPLICATION_STATE_WRITE_CHANNEL = 'md2-application-state:write';
const CLIPBOARD_COPY_AS_TEXT_CHANNEL = 'md2-clipboard:copy-as-text';
const CONFIG_SET_DESKTOP_CHANNEL = 'md2-config:set-desktop';
const LIFECYCLE_FLUSH_RESULT_CHANNEL = 'md2-lifecycle:flush-pending-commits-result';
const LIFECYCLE_FLUSH_REQUEST_CHANNEL = 'md2-lifecycle:flush-pending-commits';
const LOCAL_BRIDGE_EVENT_CHANNEL = 'md2-local-bridge:event';
const LOCAL_BRIDGE_INVOKE_CHANNEL = 'md2-local-bridge:invoke';
const LOCAL_BRIDGE_SUBSCRIBE_CHANNEL = 'md2-local-bridge:subscribe';
const LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL = 'md2-local-bridge:unsubscribe';
const REMARKABLE_IMPORT_FILES_CHANNEL = 'md2-remarkable:import-files';
const REMARKABLE_LIST_IMAGE_FILES_CHANNEL = 'md2-remarkable:list-image-files';
const REMARKABLE_TEST_CONNECTION_CHANNEL = 'md2-remarkable:test-connection';
const REMOTE_CONTROL_GET_STATUS_CHANNEL = 'md2-remote-control:get-status';
const REMOTE_CONTROL_START_CHANNEL = 'md2-remote-control:start';
const REMOTE_CONTROL_STATUS_CHANNEL = 'md2-remote-control:status';
const REMOTE_CONTROL_STOP_CHANNEL = 'md2-remote-control:stop';
const SENTRY_REQUEST_CHANNEL = 'md2-sentry:request';
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode';
const UPDATE_AVAILABLE_CHANNEL = 'md2-update:available';
const UPDATE_DOWNLOAD_CHANNEL = 'md2-update:download';
const UPDATE_PROGRESS_CHANNEL = 'md2-update:progress';

const DATA_METHODS = [
    'abortMergeConflict',
    'addWorktree',
    'calculateActivityStats',
    'cancelActionSchedule',
    'cancelActivityStatsCalculation',
    'checkoutBranch',
    'commit',
    'commitWorktree',
    'continueMergeConflict',
    'createProject',
    'deleteFile',
    'deleteFolder',
    'discardWorktreeChanges',
    'deleteLocalBranch',
    'hasPendingPush',
    'getMergeConflictSession',
    'integrateWorktree',
    'launchMergeConflictResolver',
    'listBranches',
    'listAgentConversationReferences',
    'listRepositoryFiles',
    'listTopLevelFolders',
    'loadActionFiles',
    'loadActionSchedules',
    'loadAgentAvailability',
    'loadAgentConversation',
    'loadActivityConversations',
    'loadFile',
    'loadProject',
    'loadProjectAsset',
    'loadProjectConfig',
    'loadProjectRoot',
    'loadTextFile',
    'markMergeConflictResolved',
    'moveFiles',
    'openProjectFolder',
    'parkWorktree',
    'prepareWorktree',
    'pull',
    'pullWorktree',
    'push',
    'pushWorktree',
    'rebaseWorktree',
    'refreshWorktrees',
    'rescanMergeConflict',
    'removeWorktree',
    'resolveProject',
    'saveActionSchedules',
    'saveProjectConfig',
    'selectProjectSubFolder',
    'selectWorktreeFolder',
    'stopAgent',
];
const ACTION_METHODS = [
    'acquireReleaseCardLocks',
    'answerActionApproval',
    'answerActionQuestion',
    'cancelActionRun',
    'closeWaitingActionConversation',
    'deleteActionQueuedPrompt',
    'dismissActionQuestions',
    'editActionQueuedPrompt',
    'enqueueActionPrompt',
    'finishActionRun',
    'generateDiff',
    'generateWorktreeDiff',
    'listActiveActionRuns',
    'loadActionRunHistory',
    'loadActionRunRecoverySnapshot',
    'notifyActionCardStateChange',
    'loadCardActivity',
    'loadAgentAvailability',
    'openInEditor',
    'prepareActionPrompt',
    'readFileAtCommit',
    'releaseReleaseCardLocks',
    'registerActionSchedule',
    'reserveActionConversation',
    'restartActionRun',
    'runSearchRegexpAgent',
    'sendActionMessage',
    'startAction',
    'startUnattendedAction',
    'updateActionConversationViewed',
    'updateCardActionSettings',
];
const EVENT_METHODS = new Set(['runSearchRegexpAgent']);
const CODEX_RUNTIME_METHODS = ['getCodexRateLimits'];
const CLAUDE_RUNTIME_METHODS = ['getClaudeRateLimits'];

let nextEventId = 1;
let desktopConfig = readArgumentJson('md2-desktop-config', {});

function readArgumentValue(name) {
    const prefix = `--${name}=`;
    const argument = process.argv.find((candidate) => candidate.startsWith(prefix));

    return argument ? argument.slice(prefix.length) : null;
}

function readArgumentJson(name, fallback) {
    const value = readArgumentValue(name);
    if (!value) return fallback;

    return JSON.parse(decodeURIComponent(value));
}

function createEventId(method) {
    const eventId = `${method}-${nextEventId}`;
    nextEventId += 1;

    return eventId;
}

function invokeBridge(method, params, callback) {
    const eventId = EVENT_METHODS.has(method) && callback ? createEventId(method) : null;
    let listener = null;

    if (eventId) {
        listener = (_event, message) => {
            if (message.eventId === eventId) callback(message.payload);
        };
        ipcRenderer.on(LOCAL_BRIDGE_EVENT_CHANNEL, listener);
    }

    return ipcRenderer.invoke(LOCAL_BRIDGE_INVOKE_CHANNEL, { eventId, method, params }).finally(() => {
        if (listener) ipcRenderer.removeListener(LOCAL_BRIDGE_EVENT_CHANNEL, listener);
    });
}

function subscribeBridge(method, params, callback) {
    const subscriptionId = createEventId(method);
    const listener = (_event, message) => {
        if (message.eventId === subscriptionId) callback(message.payload);
    };

    ipcRenderer.on(LOCAL_BRIDGE_EVENT_CHANNEL, listener);
    ipcRenderer.send(LOCAL_BRIDGE_SUBSCRIBE_CHANNEL, { method, params, subscriptionId });

    return () => {
        ipcRenderer.removeListener(LOCAL_BRIDGE_EVENT_CHANNEL, listener);
        ipcRenderer.send(LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL, subscriptionId);
    };
}

function createBridge(methods) {
    return Object.fromEntries(methods.map((method) => [
        method,
        (...params) => {
            const callback = EVENT_METHODS.has(method) && typeof params[params.length - 1] === 'function'
                ? params.pop()
                : null;

            return invokeBridge(method, params, callback);
        },
    ]));
}

function exposeWarning(message) {
    const render = () => {
        document.body.innerHTML = '';
        const warning = document.createElement('main');
        warning.setAttribute('role', 'alert');
        warning.style.cssText = 'font-family: system-ui, sans-serif; padding: 24px; color: #7f1d1d;';
        warning.textContent = message;
        document.body.appendChild(warning);
    };

    if (document.body) {
        render();
        return;
    }

    window.addEventListener('DOMContentLoaded', render);
}

function isAllowedOrigin() {
    const trustedLocation = readArgumentValue('md2-bridge-trusted-location');
    if (trustedLocation) {
        const currentUrl = new URL(window.location.href);
        const trustedUrl = new URL(decodeURIComponent(trustedLocation));
        currentUrl.hash = '';
        trustedUrl.hash = '';
        if (currentUrl.href === trustedUrl.href) return true;
    }

    const allowedOrigins = readArgumentJson('md2-bridge-allowed-origins', []);

    return allowedOrigins.includes(window.location.origin);
}

if (!isAllowedOrigin()) {
    exposeWarning(`MD² desktop bridges blocked for origin: ${window.location.origin}`);
} else {
    const applicationStateBridge = {
        read: (key = null) => ipcRenderer.invoke(APPLICATION_STATE_READ_CHANNEL, key),
        remove: (key) => ipcRenderer.invoke(APPLICATION_STATE_REMOVE_CHANNEL, key),
        write: (key, value) => ipcRenderer.invoke(APPLICATION_STATE_WRITE_CHANNEL, key, value),
    };
    const themeBridge = { setThemeMode: (mode) => ipcRenderer.send(THEME_SET_MODE_CHANNEL, mode) };
    const lifecycleBridge = {
        reportFlushResult: (result) => ipcRenderer.send(LIFECYCLE_FLUSH_RESULT_CHANNEL, result),
        onFlushRequested: (callback) => {
            const listener = (_event, request) => callback(request);
            ipcRenderer.on(LIFECYCLE_FLUSH_REQUEST_CHANNEL, listener);

            return () => ipcRenderer.removeListener(LIFECYCLE_FLUSH_REQUEST_CHANNEL, listener);
        },
    };
    const clipboardBridge = {
        onCopyAsTextRequested: (callback) => {
            const listener = (_event, selectionText) => callback(selectionText);
            ipcRenderer.on(CLIPBOARD_COPY_AS_TEXT_CHANNEL, listener);

            return () => ipcRenderer.removeListener(CLIPBOARD_COPY_AS_TEXT_CHANNEL, listener);
        },
    };
    const configBridge = {
        getDesktopConfig: () => desktopConfig,
        setDesktopConfig: async (values) => {
            desktopConfig = await ipcRenderer.invoke(CONFIG_SET_DESKTOP_CHANNEL, values);

            return desktopConfig;
        },
    };
    const remoteControlBridge = {
        getStatus: () => ipcRenderer.invoke(REMOTE_CONTROL_GET_STATUS_CHANNEL),
        onStatusChange: (callback) => {
            const listener = (_event, status) => callback(status);
            ipcRenderer.on(REMOTE_CONTROL_STATUS_CHANNEL, listener);

            return () => ipcRenderer.removeListener(REMOTE_CONTROL_STATUS_CHANNEL, listener);
        },
        start: () => ipcRenderer.invoke(REMOTE_CONTROL_START_CHANNEL),
        stop: () => ipcRenderer.invoke(REMOTE_CONTROL_STOP_CHANNEL),
    };
    const remarkableBridge = {
        importFiles: (request) => ipcRenderer.invoke(REMARKABLE_IMPORT_FILES_CHANNEL, request),
        listImageFiles: (settings) => ipcRenderer.invoke(REMARKABLE_LIST_IMAGE_FILES_CHANNEL, settings),
        testConnection: (settings) => ipcRenderer.invoke(REMARKABLE_TEST_CONNECTION_CHANNEL, settings),
    };
    const sentryBridge = { request: (request) => ipcRenderer.invoke(SENTRY_REQUEST_CHANNEL, request) };
    const fileBridge = { getPathForFile: (file) => webUtils.getPathForFile(file) };
    const dataBridge = {
        ...createBridge(DATA_METHODS),
        onMergeConflictSessionChanged: (callback) => subscribeBridge('onMergeConflictSessionChanged', [], callback),
        onWorktreesChanged: (callback) => subscribeBridge('onWorktreesChanged', [], callback),
        watchProject: (project, callback) => subscribeBridge('watchProject', [project], callback),
    };
    const actionBridge = {
        ...createBridge(ACTION_METHODS),
        onActionRun: (callback) => subscribeBridge('onActionRun', [], callback),
    };
    const codexRuntimeBridge = {
        ...createBridge(CODEX_RUNTIME_METHODS),
        onCodexRateLimits: (callback) => subscribeBridge('onCodexRateLimits', [], callback),
        onCodexUpdateRequired: (callback) => subscribeBridge('onCodexUpdateRequired', [], callback),
        updateCodexCli: () => invokeBridge('updateCodexCli', [], null),
    };
    const claudeRuntimeBridge = {
        ...createBridge(CLAUDE_RUNTIME_METHODS),
        onClaudeRateLimits: (callback) => subscribeBridge('onClaudeRateLimits', [], callback),
    };
    const updatesBridge = {
        downloadUpdate: (downloadUrl) => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL, { downloadUrl }),
        onDownloadProgress: (callback) => {
            const listener = (_event, progress) => callback(progress);
            ipcRenderer.on(UPDATE_PROGRESS_CHANNEL, listener);

            return () => ipcRenderer.removeListener(UPDATE_PROGRESS_CHANNEL, listener);
        },
        onUpdateAvailable: (callback) => {
            const listener = (_event, info) => callback(info);
            ipcRenderer.on(UPDATE_AVAILABLE_CHANNEL, listener);

            return () => ipcRenderer.removeListener(UPDATE_AVAILABLE_CHANNEL, listener);
        },
    };

    contextBridge.exposeInMainWorld('md2ApplicationState', applicationStateBridge);
    contextBridge.exposeInMainWorld('md2Theme', themeBridge);
    contextBridge.exposeInMainWorld('md2Lifecycle', lifecycleBridge);
    contextBridge.exposeInMainWorld('md2Clipboard', clipboardBridge);
    contextBridge.exposeInMainWorld('md2Config', configBridge);
    contextBridge.exposeInMainWorld('md2RemoteControl', remoteControlBridge);
    contextBridge.exposeInMainWorld('md2Remarkable', remarkableBridge);
    contextBridge.exposeInMainWorld('md2Sentry', sentryBridge);
    contextBridge.exposeInMainWorld('md2Files', fileBridge);
    contextBridge.exposeInMainWorld('md2Data', dataBridge);
    contextBridge.exposeInMainWorld('md2Actions', actionBridge);
    contextBridge.exposeInMainWorld('md2ClaudeRuntime', claudeRuntimeBridge);
    contextBridge.exposeInMainWorld('md2CodexRuntime', codexRuntimeBridge);
    contextBridge.exposeInMainWorld('md2Updates', updatesBridge);
}
