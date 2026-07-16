const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');

const desktopEnvironmentPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '.env');
if (existsSync(desktopEnvironmentPath)) process.loadEnvFile(desktopEnvironmentPath);

const Store = require('electron-store');
const { readDesktopConfig, resolveBridgeAllowedOrigins, writeDesktopConfig } = require('./src/shell/config');
const { AgentRunnerService } = require('./src/actions/agent_runner_service');
const { loadAgentExecutableAvailability } = require('./src/actions/agent_executable_availability');
const { ActionSchedulerService } = require('./src/actions/action_scheduler_service');
const { ActionRunnerService } = require('./src/actions/action_runner_service');
const diffService = require('./src/git/diff_service');
const { createLocalBridgeDispatch } = require('./src/shell/local_bridge_dispatch');
const localGitService = require('./src/git/local_git_service');
const { RemoteControlService } = require('./src/integrations/remote_control_service');
const remarkableService = require('./src/integrations/remarkable_service');
const { WorktreeService } = require('./src/git/worktree_service');
const { ActionWorktreeExecutionService } = require('./src/actions/action_worktree_execution_service');
const { captureError, flush, registerProcessErrorHandlers, startElectronTelemetry, trackEvent } = require('./src/integrations/telemetry');
const { THEME_MODE_STORE_KEY, resolveThemeMode, resolveTitleBarOverlay } = require('./src/shell/theme');
const { registerNavigationGuards, resolveRendererStaticDir, resolveRendererTarget } = require('./src/shell/renderer_security');
const {
    SPELL_CHECKER_LANGUAGES_STORE_KEY,
    applyStoredSpellCheckerLanguages,
    refreshSpellCheck,
    registerSpellCheckContextMenu,
} = require('./src/integrations/spellcheck');
const {
    CONFIG_GET_DESKTOP_CHANNEL,
    CONFIG_SET_DESKTOP_CHANNEL,
    LIFECYCLE_FLUSH_DONE_CHANNEL,
    LIFECYCLE_FLUSH_REQUEST_CHANNEL,
    LOCAL_BRIDGE_EVENT_CHANNEL,
    LOCAL_BRIDGE_INVOKE_CHANNEL,
    LOCAL_BRIDGE_SUBSCRIBE_CHANNEL,
    LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL,
    REMARKABLE_IMPORT_FILES_CHANNEL,
    REMARKABLE_LIST_IMAGE_FILES_CHANNEL,
    REMARKABLE_TEST_CONNECTION_CHANNEL,
    REMOTE_CONTROL_GET_STATUS_CHANNEL,
    REMOTE_CONTROL_START_CHANNEL,
    REMOTE_CONTROL_STATUS_CHANNEL,
    REMOTE_CONTROL_STOP_CHANNEL,
    THEME_SET_MODE_CHANNEL,
} = require('./src/shell/ipc_channels');

const QUIT_FLUSH_TIMEOUT_MS = 5000;
const QUIT_WATCHDOG_TIMEOUT_MS = 10000;
const EVENT_METHODS = new Set(['runSearchRegexpAgent', 'startAgentConversation']);
const SUBSCRIPTION_METHODS = new Set(['onActionExecution', 'watchProject']);

const store = new Store();
Store.initRenderer();
const agentRunnerService = new AgentRunnerService();
const worktreeService = new WorktreeService({ runGit: localGitService.runGit });
const actionWorktreeExecutionService = new ActionWorktreeExecutionService({
    runGit: localGitService.runGit,
    worktreeService,
});
const actionRunnerService = new ActionRunnerService({
    actionWorktreeExecutionService,
    agentConfigProvider: () => readDesktopConfig(store),
    agentRunnerService,
    errorReporter: captureError,
    localGitService,
});
const actionSchedulerService = new ActionSchedulerService({
    actionRunnerService,
    localGitService,
});
const localBridgeDispatch = createLocalBridgeDispatch({
    actionRunnerService,
    actionSchedulerService,
    actionWorktreeExecutionService,
    agentExecutableAvailability: loadAgentExecutableAvailability,
    agentRunnerService,
    desktopConfigStore: store,
    diffService,
    localGitService,
    openProjectFolder: () => openProjectFolder(BrowserWindow.getFocusedWindow()),
    openWorktreeFolder: () => openWorktreeFolder(BrowserWindow.getFocusedWindow()),
    readDesktopConfig,
    worktreeService,
});
const remoteControlService = new RemoteControlService(localBridgeDispatch);
const electronTelemetryStarted = startElectronTelemetry({ isDevelopment: !app.isPackaged });
const subscriptionCleanups = new Map();
let isQuittingAfterTelemetry = false;

registerProcessErrorHandlers();

async function openProjectFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Open local Git project',
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    return result.filePaths[0];
}

async function openWorktreeFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Register linked Git worktree',
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    return result.filePaths[0];
}

function subscriptionKey(webContents, subscriptionId) {
    return `${webContents.id}:${subscriptionId}`;
}

function removeSubscription(webContents, subscriptionId) {
    const key = subscriptionKey(webContents, subscriptionId);
    const cleanup = subscriptionCleanups.get(key);
    if (!cleanup) return;

    cleanup();
    subscriptionCleanups.delete(key);
}

function registerLocalBridge() {
    ipcMain.handle(LOCAL_BRIDGE_INVOKE_CHANNEL, (event, request) => {
        const { eventId, method, params } = request;
        if (!EVENT_METHODS.has(method)) return localBridgeDispatch.invoke(method, params);

        return localBridgeDispatch.invoke(method, [
            ...params,
            (payload) => event.sender.send(LOCAL_BRIDGE_EVENT_CHANNEL, { eventId, payload }),
        ]);
    });

    ipcMain.on(LOCAL_BRIDGE_SUBSCRIBE_CHANNEL, (event, request) => {
        const { method, params, subscriptionId } = request;
        if (!SUBSCRIPTION_METHODS.has(method)) throw new Error(`Unsupported bridge subscription: ${method}`);

        removeSubscription(event.sender, subscriptionId);
        const cleanup = localBridgeDispatch.invoke(method, [
            ...params,
            (payload) => event.sender.send(LOCAL_BRIDGE_EVENT_CHANNEL, { eventId: subscriptionId, payload }),
        ]);
        subscriptionCleanups.set(subscriptionKey(event.sender, subscriptionId), cleanup);
        event.sender.once('destroyed', () => removeSubscription(event.sender, subscriptionId));
    });

    ipcMain.on(LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL, (event, subscriptionId) => {
        removeSubscription(event.sender, subscriptionId);
    });
}

function registerConfigBridge() {
    ipcMain.handle(CONFIG_GET_DESKTOP_CHANNEL, () => readDesktopConfig(store));
    ipcMain.handle(CONFIG_SET_DESKTOP_CHANNEL, (_event, values) => writeDesktopConfig(store, values));
}

function broadcastRemoteControlStatus(status) {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(REMOTE_CONTROL_STATUS_CHANNEL, status);
    }
}

function registerRemarkableBridge() {
    ipcMain.handle(REMARKABLE_TEST_CONNECTION_CHANNEL, (_event, settings) => remarkableService.testConnection(settings));
    ipcMain.handle(REMARKABLE_LIST_IMAGE_FILES_CHANNEL, (_event, settings) => remarkableService.listImageFiles(settings));
    ipcMain.handle(REMARKABLE_IMPORT_FILES_CHANNEL, (_event, request) => remarkableService.importFiles(request));
}

function registerRemoteControlBridge() {
    remoteControlService.setStatusListener(broadcastRemoteControlStatus);

    const staticDir = resolveRendererStaticDir(app.isPackaged, __dirname);
    ipcMain.handle(REMOTE_CONTROL_START_CHANNEL, async () => remoteControlService.start({ host: '0.0.0.0', staticDir }));
    ipcMain.handle(REMOTE_CONTROL_STOP_CHANNEL, async () => remoteControlService.stop());
    ipcMain.handle(REMOTE_CONTROL_GET_STATUS_CHANNEL, () => remoteControlService.getStatus());
}

/** Keep the persisted mode, native theme source and window controls in sync with the renderer. */
function registerThemeBridge() {
    ipcMain.on(THEME_SET_MODE_CHANNEL, (event, incomingMode) => {
        const mode = resolveThemeMode(incomingMode);
        store.set(THEME_MODE_STORE_KEY, mode);
        nativeTheme.themeSource = mode;

        const window = BrowserWindow.fromWebContents(event.sender);
        window?.setTitleBarOverlay?.(resolveTitleBarOverlay(mode));
    });
}

function createWindow() {
    const mode = resolveThemeMode(store.get(THEME_MODE_STORE_KEY));
    const desktopConfig = readDesktopConfig(store);
    const rendererTarget = resolveRendererTarget(app.isPackaged, __dirname);
    const bridgeAllowedOrigins = rendererTarget.type === 'url'
        ? resolveBridgeAllowedOrigins(desktopConfig, rendererTarget.url)
        : [];
    nativeTheme.themeSource = mode;

    const window = new BrowserWindow({
        width: 1280,
        height: 900,
        icon: path.join(__dirname, 'build', 'md2.ico'),
        titleBarStyle: 'hidden',
        titleBarOverlay: resolveTitleBarOverlay(mode),
        webPreferences: {
            additionalArguments: [
                `--md2-bridge-allowed-origins=${encodeURIComponent(JSON.stringify(bridgeAllowedOrigins))}`,
                `--md2-bridge-trusted-location=${encodeURIComponent(rendererTarget.trustedLocation)}`,
                `--md2-desktop-config=${encodeURIComponent(JSON.stringify(desktopConfig))}`,
            ],
            preload: path.join(__dirname, 'src', 'shell', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    registerNavigationGuards(window.webContents, rendererTarget.trustedLocation, (url) => shell.openExternal(url));
    const spellCheckerSession = window.webContents.session;
    applyStoredSpellCheckerLanguages(spellCheckerSession, store.get(SPELL_CHECKER_LANGUAGES_STORE_KEY));
    registerSpellCheckContextMenu(window.webContents, (template) => Menu.buildFromTemplate(template), {
        getActiveLanguages: () => spellCheckerSession.getSpellCheckerLanguages(),
        getAvailableLanguages: () => spellCheckerSession.availableSpellCheckerLanguages,
        setActiveLanguages: (languages) => {
            spellCheckerSession.setSpellCheckerLanguages(languages);
            store.set(SPELL_CHECKER_LANGUAGES_STORE_KEY, languages);
            refreshSpellCheck(window.webContents);
        },
    });
    // A newly selected language may still be downloading its dictionary when
    // the switch happens; refresh again once Chromium finishes loading it.
    const handleDictionaryInitialized = () => refreshSpellCheck(window.webContents);
    spellCheckerSession.on('spellcheck-dictionary-initialized', handleDictionaryInitialized);
    window.on('closed', () => spellCheckerSession.removeListener('spellcheck-dictionary-initialized', handleDictionaryInitialized));
    if (rendererTarget.type === 'file') {
        void window.loadFile(rendererTarget.filePath);
    } else {
        void window.loadURL(rendererTarget.url);
    }

    if (!app.isPackaged) {
        window.webContents.openDevTools();
    }
}

async function stopAndQuit() {
    if (isQuittingAfterTelemetry) return;

    isQuittingAfterTelemetry = true;
    // before-quit already called preventDefault(); if cleanup below rejects or hangs the app
    // can never quit. Force-exit watchdog guarantees the process terminates regardless.
    const watchdog = setTimeout(() => app.exit(0), QUIT_WATCHDOG_TIMEOUT_MS);

    try {
        await flushRendererPendingCommits();
        await remoteControlService.stop();
        actionSchedulerService.stop();
        actionRunnerService.stop();
        agentRunnerService.stopAll();
        await trackEvent('electron_stop');
        await flush();
    } catch {
        // Shutdown cleanup must never block quit.
    } finally {
        clearTimeout(watchdog);
        app.quit();
    }
}

function waitForRendererFlush(browserWindow, requestId) {
    if (browserWindow.webContents.isDestroyed()) return Promise.resolve();

    return new Promise((resolve) => {
        let isSettled = false;
        let timeoutId = null;

        function settle() {
            if (isSettled) return;

            isSettled = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            ipcMain.removeListener(LIFECYCLE_FLUSH_DONE_CHANNEL, handleFlushDone);
            resolve();
        }

        function handleFlushDone(event, completedRequestId) {
            if (event.sender !== browserWindow.webContents) return;
            if (completedRequestId !== requestId) return;

            settle();
        }

        timeoutId = setTimeout(settle, QUIT_FLUSH_TIMEOUT_MS);
        ipcMain.on(LIFECYCLE_FLUSH_DONE_CHANNEL, handleFlushDone);

        try {
            browserWindow.webContents.send(LIFECYCLE_FLUSH_REQUEST_CHANNEL, requestId);
        } catch {
            settle();
        }
    });
}

async function flushRendererPendingCommits() {
    const windows = BrowserWindow.getAllWindows();
    const flushes = windows.map((browserWindow, index) => waitForRendererFlush(browserWindow, `quit-${Date.now()}-${index}`));

    await Promise.all(flushes);
}

app.whenReady().then(async () => {
    await electronTelemetryStarted;
    registerConfigBridge();
    registerLocalBridge();
    registerRemarkableBridge();
    registerRemoteControlBridge();
    registerThemeBridge();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', (event) => {
    if (isQuittingAfterTelemetry) return;

    event.preventDefault();
    void stopAndQuit();
});
