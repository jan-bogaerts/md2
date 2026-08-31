const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const { existsSync } = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const desktopEnvironmentPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '.env');
if (existsSync(desktopEnvironmentPath)) process.loadEnvFile(desktopEnvironmentPath);

const Store = require('electron-store');
const windowStateKeeper = require('electron-window-state');
const {
    createApplicationStateStore,
    registerApplicationStateBridge,
} = require('./src/shell/application_state_store');
const { readDesktopConfig, resolveBridgeAllowedOrigins, saveDesktopConfig } = require('./src/shell/config');
const { AgentRunnerService } = require('./src/actions/agent/agent_runner_service');
const { CodexRuntimeService } = require('./src/actions/agent/codex_runtime_service');
const { ClaudeRuntimeService } = require('./src/actions/agent/claude_runtime_service');
const { UsageMetricsService } = require('./src/actions/agent/usage_metrics_service');
const { updateCodexCli } = require('./src/actions/agent/codex_cli_update');
const { AgentExecutableResolver, loadAgentExecutableAvailability } = require('./src/actions/agent/agent_executable_availability');
const { ActionSchedulerService } = require('./src/actions/action/action_scheduler_service');
const { ActionRunnerService } = require('./src/actions/action/action_runner_service');
const diffService = require('./src/git/diff_service');
const { createLocalBridgeDispatch } = require('./src/shell/local_bridge_dispatch');
const { invokeWithErrorEnvelope } = require('./src/shell/bridge_invoke');
const localGitService = require('./src/git/local_git_service');
const { RemoteControlService } = require('./src/integrations/remote_control_service');
const remarkableService = require('./src/integrations/remarkable_service');
const { sendSentryRequest } = require('./src/integrations/sentry_service');
const { WorktreeService } = require('./src/git/worktree_service');
const { MergeConflictService } = require('./src/git/merge_conflict_service');
const { ActionWorktreeRunService } = require('./src/actions/action/action_worktree_run_service');
const { captureError, flush, registerProcessErrorHandlers, startElectronTelemetry, trackEvent } = require('./src/integrations/telemetry');
const { THEME_MODE_STORE_KEY, resolveThemeMode, resolveTitleBarOverlay } = require('./src/shell/theme');
const { registerNavigationGuards, resolveRendererStaticDir, resolveRendererTarget } = require('./src/shell/renderer_security');
const { registerTextContextMenu } = require('./src/shell/text_context_menu');
const {
    SPELL_CHECKER_LANGUAGES_STORE_KEY,
    applyStoredSpellCheckerLanguages,
    refreshSpellCheck,
} = require('./src/integrations/spellcheck');
const {
    CONFIG_GET_DESKTOP_CHANNEL,
    CONFIG_SET_DESKTOP_CHANNEL,
    LIFECYCLE_FLUSH_RESULT_CHANNEL,
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
    SENTRY_REQUEST_CHANNEL,
    THEME_SET_MODE_CHANNEL,
} = require('./src/shell/ipc_channels');
const { checkForUpdate, registerUpdateDownload } = require('./src/shell/update_service');
const { CloseCoordinator } = require('./src/shell/close_coordinator');
const { createManagedWindow } = require('./src/shell/window_state');
const { ProjectStatsWorkerService } = require('./src/stats/project_stats_worker_service');

const QUIT_WATCHDOG_TIMEOUT_MS = 10000;
const EVENT_METHODS = new Set(['runSearchRegexpAgent', 'startAgentConversation']);
const SUBSCRIPTION_METHODS = new Set([
    'onActionRun',
    'onClaudeRateLimits',
    'onCodexRateLimits',
    'onCodexUpdateRequired',
    'onMergeConflictSessionChanged',
    'onWorktreesChanged',
    'watchProject',
]);

const store = new Store();
const applicationStateStore = createApplicationStateStore(Store);
Store.initRenderer();
const agentExecutableResolver = new AgentExecutableResolver();
const claudeRuntimeService = new ClaudeRuntimeService();
const codexRuntimeService = new CodexRuntimeService();
const usageMetricsService = new UsageMetricsService({ errorReporter: captureError });
const agentRunnerService = new AgentRunnerService({
    claudeRuntimeService,
    codexRuntimeService,
    executableResolver: agentExecutableResolver,
    usageMetricsService,
});
const mergeConflictService = new MergeConflictService({
    configProvider: () => readDesktopConfig(store),
    runGit: localGitService.runGit,
    store,
});
const worktreeService = new WorktreeService({ errorReporter: captureError, mergeConflictService, runGit: localGitService.runGit });
const actionWorktreeRunService = new ActionWorktreeRunService({
    mergeConflictService,
    runGit: localGitService.runGit,
    worktreeService,
});
const actionRunnerService = new ActionRunnerService({
    actionWorktreeRunService,
    agentConfigProvider: () => readDesktopConfig(store),
    agentRunnerService,
    codexRuntimeService,
    errorReporter: captureError,
    localGitService,
    mergeConflictService,
    usageMetricsService,
});
const actionSchedulerService = new ActionSchedulerService({
    actionRunnerService,
    localGitService,
});
const projectStatsWorkerService = new ProjectStatsWorkerService();
const localBridgeDispatch = createLocalBridgeDispatch({
    actionRunnerService,
    actionSchedulerService,
    actionWorktreeRunService,
    agentExecutableAvailability: (profiles) => loadAgentExecutableAvailability(profiles, { resolver: agentExecutableResolver }),
    agentRunnerService,
    claudeRuntimeService,
    codexRuntimeService,
    desktopConfigStore: store,
    diffService,
    localGitService,
    mergeConflictService,
    openProjectFolder: () => openProjectFolder(BrowserWindow.getFocusedWindow()),
    openProjectSubFolder: (rootPath) => openProjectSubFolder(BrowserWindow.getFocusedWindow(), rootPath),
    openWorktreeFolder: () => openWorktreeFolder(BrowserWindow.getFocusedWindow()),
    projectStatsWorkerService,
    readDesktopConfig,
    saveDesktopConfig,
    updateCodexCli,
    worktreeService,
});
const remoteControlService = new RemoteControlService(localBridgeDispatch);
const electronTelemetryStarted = startElectronTelemetry({ isDevelopment: !app.isPackaged });
const subscriptionCleanups = new Map();
let isQuittingAfterTelemetry = false;
const closeCoordinator = new CloseCoordinator({
    completeApplicationQuit: () => stopAndQuit(),
    getWindows: () => BrowserWindow.getAllWindows(),
    sendFlushRequest: (webContents, request) => webContents.send(LIFECYCLE_FLUSH_REQUEST_CHANNEL, request),
    showMessageBox: (...parameters) => dialog.showMessageBox(...parameters),
});

registerProcessErrorHandlers();

async function openProjectFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Open local Git project',
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    return result.filePaths[0];
}

async function openProjectSubFolder(window, rootPath) {
    const result = await dialog.showOpenDialog(window, {
        defaultPath: rootPath,
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose project folder',
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    return result.filePaths[0];
}

async function openWorktreeFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Choose linked Git worktree folder',
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

        return invokeWithErrorEnvelope(() => {
            if (!EVENT_METHODS.has(method)) return localBridgeDispatch.invoke(method, params);

            return localBridgeDispatch.invoke(method, [
                ...params,
                (payload) => event.sender.send(LOCAL_BRIDGE_EVENT_CHANNEL, { eventId, payload }),
            ]);
        });
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
    ipcMain.handle(CONFIG_SET_DESKTOP_CHANNEL, (_event, values) => localBridgeDispatch.invoke('saveDesktopConfig', [values]));
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

function registerSentryBridge() {
    ipcMain.handle(SENTRY_REQUEST_CHANNEL, (_event, request) => sendSentryRequest(request));
}

function registerRemoteControlBridge() {
    remoteControlService.setStatusListener(broadcastRemoteControlStatus);

    const staticDir = resolveRendererStaticDir(app.isPackaged, __dirname);
    ipcMain.handle(REMOTE_CONTROL_START_CHANNEL, async () => {
        const { remoteControlPort } = readDesktopConfig(store);

        return remoteControlService.start({ host: '0.0.0.0', port: remoteControlPort, staticDir });
    });
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

    const browserWindowOptions = {
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
    };
    const window = createManagedWindow({
        BrowserWindow,
        browserWindowOptions,
        windowStateKeeper,
    });
    closeCoordinator.bindWindow(window);

    registerNavigationGuards(window.webContents, rendererTarget.trustedLocation, (url) => shell.openExternal(url));
    const spellCheckerSession = window.webContents.session;
    applyStoredSpellCheckerLanguages(spellCheckerSession, store.get(SPELL_CHECKER_LANGUAGES_STORE_KEY));
    registerTextContextMenu(window.webContents, {
        buildMenu: (template) => Menu.buildFromTemplate(template),
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

    return window;
}

async function stopAndQuit() {
    if (isQuittingAfterTelemetry) return;

    isQuittingAfterTelemetry = true;
    // before-quit already called preventDefault(); if cleanup below rejects or hangs the app
    // can never quit. Force-exit watchdog guarantees the process terminates regardless.
    const watchdog = setTimeout(() => app.exit(0), QUIT_WATCHDOG_TIMEOUT_MS);

    try {
        await remoteControlService.stop();
        actionSchedulerService.stop();
        await actionRunnerService.suspend();
        await agentRunnerService.stopAll();
        await trackEvent('electron_stop');
        await flush();
    } catch {
        // Shutdown cleanup must never block quit.
    } finally {
        clearTimeout(watchdog);
        app.quit();
    }
}

app.whenReady().then(async () => {
    await electronTelemetryStarted;
    registerApplicationStateBridge(ipcMain, applicationStateStore);
    registerConfigBridge();
    registerLocalBridge();
    registerRemarkableBridge();
    registerSentryBridge();
    registerRemoteControlBridge();
    registerThemeBridge();
    const getPrimaryWindow = () => BrowserWindow.getAllWindows()[0] ?? null;
    registerUpdateDownload({ app, getWindow: getPrimaryWindow, https, ipcMain, shell });
    createWindow();
    void checkForUpdate({ app, getWindow: getPrimaryWindow, https });

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
    void closeCoordinator.requestApplicationQuit();
});

ipcMain.on(LIFECYCLE_FLUSH_RESULT_CHANNEL, (event, result) => {
    closeCoordinator.handleFlushResult(event.sender, result);
});
