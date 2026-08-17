import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const mainPath = join(currentDirectory, '..', '..', 'main.js');
const preloadPath = join(currentDirectory, 'preload.js');

function createPreloadHarness(options = {}) {
    const origin = options.origin ?? 'http://localhost:5173';
    const href = options.href ?? `${origin}/`;
    const allowedOrigins = options.allowedOrigins ?? ['http://localhost:5173'];
    const trustedLocation = options.trustedLocation ?? 'http://localhost:5173';
    const desktopConfig = options.desktopConfig ?? { agent: 'codex', agentProfiles: [{ command: ['codex'], name: 'codex' }], model: '' };
    const body = {
        appendChild: vi.fn(),
        innerHTML: 'app',
    };
    const document = {
        body,
        createElement: vi.fn(() => ({
            setAttribute: vi.fn(),
            style: {},
            textContent: '',
        })),
    };
    const window = { addEventListener: vi.fn(), location: { href, origin } };
    const exposed = {};
    const contextBridge = {
        exposeInMainWorld: vi.fn((name, bridge) => {
            exposed[name] = bridge;
            window[name] = bridge;
        }),
    };
    const electron = {
        contextBridge,
        ipcRenderer: { invoke: vi.fn(async () => null), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
        webUtils: { getPathForFile: vi.fn(() => 'C:\\Files\\report.pdf') },
    };
    const argv = [
        `--md2-bridge-allowed-origins=${encodeURIComponent(JSON.stringify(allowedOrigins))}`,
        `--md2-bridge-trusted-location=${encodeURIComponent(trustedLocation)}`,
        `--md2-desktop-config=${encodeURIComponent(JSON.stringify(desktopConfig))}`,
    ];
    const mockedModules = { electron };
    const fakeRequire = (moduleName) => mockedModules[moduleName];
    const module = { exports: {} };
    const context = vm.createContext({
        document,
        module,
        exports: module.exports,
        process: { argv },
        require: fakeRequire,
        URL,
        window,
    });
    const script = new vm.Script(readFileSync(preloadPath, 'utf8'), { filename: preloadPath });

    script.runInContext(context);

    return { document, electron, exposed, window };
}

describe('preload desktop agent bridge', () => {
    it('exposes only the named desktop bridges through contextBridge', () => {
        const { electron, exposed, window } = createPreloadHarness();

        expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(12);
        expect(Object.keys(exposed).sort()).toEqual([
            'md2Actions',
            'md2ClaudeRuntime',
            'md2CodexRuntime',
            'md2Config',
            'md2Data',
            'md2Files',
            'md2Lifecycle',
            'md2Remarkable',
            'md2RemoteControl',
            'md2Sentry',
            'md2Theme',
            'md2Updates',
        ]);
        expect(window.require).toBeUndefined();
        expect(exposed.md2Data.openProjectFolder).toEqual(expect.any(Function));
        expect(exposed.md2Files.getPathForFile).toEqual(expect.any(Function));
        expect(exposed.md2Data.selectWorktreeFolder).toEqual(expect.any(Function));
        expect(exposed.md2Data.loadAgentAvailability).toEqual(expect.any(Function));
        expect(exposed.md2Data.prepareWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.commitWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.discardWorktreeChanges).toEqual(expect.any(Function));
        expect(exposed.md2Data.deleteLocalBranch).toEqual(expect.any(Function));
        expect(exposed.md2Data.integrateWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.getMergeConflictSession).toEqual(expect.any(Function));
        expect(exposed.md2Data.launchMergeConflictResolver).toEqual(expect.any(Function));
        expect(exposed.md2Data.markMergeConflictResolved).toEqual(expect.any(Function));
        expect(exposed.md2Data.continueMergeConflict).toEqual(expect.any(Function));
        expect(exposed.md2Data.abortMergeConflict).toEqual(expect.any(Function));
        expect(exposed.md2Data.rescanMergeConflict).toEqual(expect.any(Function));
        expect(exposed.md2Data.onMergeConflictSessionChanged).toEqual(expect.any(Function));
        expect(exposed.md2Data.parkWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.pullWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.pull).toEqual(expect.any(Function));
        expect(exposed.md2Data.pushWorktree).toEqual(expect.any(Function));
        expect(exposed.md2Data.refreshWorktrees).toEqual(expect.any(Function));
        expect(exposed.md2Data.onWorktreesChanged).toEqual(expect.any(Function));
        expect(exposed.md2Actions.prepareActionPrompt).toEqual(expect.any(Function));
        expect(exposed.md2Actions.startAction).toEqual(expect.any(Function));
        expect(exposed.md2Actions.sendActionMessage).toEqual(expect.any(Function));
        expect(exposed.md2Actions.answerActionApproval).toEqual(expect.any(Function));
        expect(exposed.md2Actions.answerActionQuestion).toEqual(expect.any(Function));
        expect(exposed.md2Actions.closeWaitingActionConversation).toEqual(expect.any(Function));
        expect(exposed.md2Actions.updateActionConversationViewed).toEqual(expect.any(Function));
        expect(exposed.md2Actions.updateCardActionSettings).toEqual(expect.any(Function));
        expect(exposed.md2Actions.finishActionRun).toEqual(expect.any(Function));
        expect(exposed.md2Actions.generateWorktreeDiff).toEqual(expect.any(Function));
        expect(exposed.md2Actions.restartActionRun).toEqual(expect.any(Function));
        expect(exposed.md2Actions.loadActiveActionRunEvents).toEqual(expect.any(Function));
        expect(exposed.md2Actions.notifyActionCardStateChange).toEqual(expect.any(Function));
        expect(exposed.md2Actions.runCommand).toBeUndefined();
        expect(exposed.md2Lifecycle.onFlushRequested).toEqual(expect.any(Function));
        expect(exposed.md2RemoteControl.onStatusChange).toEqual(expect.any(Function));
        expect(exposed.md2ClaudeRuntime.getClaudeRateLimits).toEqual(expect.any(Function));
        expect(exposed.md2ClaudeRuntime.onClaudeRateLimits).toEqual(expect.any(Function));
        expect(exposed.md2CodexRuntime.getCodexRateLimits).toEqual(expect.any(Function));
        expect(exposed.md2CodexRuntime.onCodexRateLimits).toEqual(expect.any(Function));
        expect(exposed.md2CodexRuntime.onCodexUpdateRequired).toEqual(expect.any(Function));
        expect(exposed.md2CodexRuntime.updateCodexCli).toEqual(expect.any(Function));
        expect(exposed.md2Updates.onUpdateAvailable).toEqual(expect.any(Function));
        expect(exposed.md2Updates.downloadUpdate).toEqual(expect.any(Function));
        expect(exposed.md2Sentry.request).toEqual(expect.any(Function));
        expect(exposed.md2Updates.onDownloadProgress).toEqual(expect.any(Function));
    });

    it('resolves renderer File paths only through Electron webUtils', () => {
        const { electron, exposed } = createPreloadHarness();
        const file = { name: 'report.pdf' };

        expect(exposed.md2Files.getPathForFile(file)).toBe('C:\\Files\\report.pdf');
        expect(electron.webUtils.getPathForFile).toHaveBeenCalledWith(file);
        expect(exposed.md2Files.webUtils).toBeUndefined();
    });

    it('wraps update-available notifications without exposing ipcRenderer', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2Updates.onUpdateAvailable(callback);
        const listenerCall = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === 'md2-update:available');
        const listener = listenerCall[1];

        listener({ sender: 'internal' }, { downloadUrl: 'https://example.test/md2.exe', version: '0.3.0' });
        unsubscribe();

        expect(callback).toHaveBeenCalledWith({ downloadUrl: 'https://example.test/md2.exe', version: '0.3.0' });
        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith('md2-update:available', listener);
        expect(exposed.md2Updates.ipcRenderer).toBeUndefined();
    });

    it('subscribes and unsubscribes worktree state through validated IPC channels', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2Data.onWorktreesChanged(callback);
        const listenerCall = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === 'md2-local-bridge:event');
        const listener = listenerCall[1];
        const subscriptionRequest = electron.ipcRenderer.send.mock.calls.find(([channel]) => channel === 'md2-local-bridge:subscribe')[1];

        listener({}, {
            eventId: subscriptionRequest.subscriptionId,
            payload: { error: null, primaryStatus: null, project: null, records: [] },
        });
        unsubscribe();

        expect(subscriptionRequest).toEqual(expect.objectContaining({ method: 'onWorktreesChanged', params: [] }));
        expect(callback).toHaveBeenCalledWith({ error: null, primaryStatus: null, project: null, records: [] });
        expect(electron.ipcRenderer.send).toHaveBeenCalledWith('md2-local-bridge:unsubscribe', subscriptionRequest.subscriptionId);
    });

    it('subscribes to account-wide Codex runtime updates through local IPC', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2CodexRuntime.onCodexRateLimits(callback);
        const listenerCall = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === 'md2-local-bridge:event');
        const listener = listenerCall[1];
        const subscriptionRequest = electron.ipcRenderer.send.mock.calls.find(([channel]) => channel === 'md2-local-bridge:subscribe')[1];
        const snapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null };

        listener({}, { eventId: subscriptionRequest.subscriptionId, payload: snapshot });
        unsubscribe();

        expect(subscriptionRequest).toEqual(expect.objectContaining({ method: 'onCodexRateLimits', params: [] }));
        expect(callback).toHaveBeenCalledWith(snapshot);
        expect(electron.ipcRenderer.send).toHaveBeenCalledWith('md2-local-bridge:unsubscribe', subscriptionRequest.subscriptionId);
    });

    it('subscribes to account-wide Claude runtime updates through local IPC', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2ClaudeRuntime.onClaudeRateLimits(callback);
        const listenerCall = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === 'md2-local-bridge:event');
        const listener = listenerCall[1];
        const subscriptionRequest = electron.ipcRenderer.send.mock.calls.find(([channel]) => channel === 'md2-local-bridge:subscribe')[1];
        const snapshot = { available: true, observedAt: 10, windows: [] };

        listener({}, { eventId: subscriptionRequest.subscriptionId, payload: snapshot });
        unsubscribe();

        expect(subscriptionRequest).toEqual(expect.objectContaining({ method: 'onClaudeRateLimits', params: [] }));
        expect(callback).toHaveBeenCalledWith(snapshot);
        expect(electron.ipcRenderer.send).toHaveBeenCalledWith('md2-local-bridge:unsubscribe', subscriptionRequest.subscriptionId);
    });

    it('updates Codex without accepting renderer command input', async () => {
        const { electron, exposed } = createPreloadHarness();

        await exposed.md2CodexRuntime.updateCodexCli('malicious command');

        expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('md2-local-bridge:invoke', {
            eventId: null,
            method: 'updateCodexCli',
            params: [],
        });
    });

    it('wraps remote-control callbacks without exposing ipcRenderer', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2RemoteControl.onStatusChange(callback);
        const listener = electron.ipcRenderer.on.mock.calls[0][1];

        listener({ sender: 'internal' }, { endpoint: 'ws://localhost:3555', running: true });
        unsubscribe();

        expect(electron.ipcRenderer.on).toHaveBeenCalledWith('md2-remote-control:status', expect.any(Function));
        expect(callback).toHaveBeenCalledWith({ endpoint: 'ws://localhost:3555', running: true });
        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith('md2-remote-control:status', listener);
        expect(exposed.md2RemoteControl.ipcRenderer).toBeUndefined();
    });

    it('routes folder selection through the validated local bridge dispatcher', async () => {
        const { electron, exposed } = createPreloadHarness();

        await exposed.md2Data.openProjectFolder();

        expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('md2-local-bridge:invoke', {
            eventId: null,
            method: 'openProjectFolder',
            params: [],
        });
        expect(electron.ipcRenderer.invoke).not.toHaveBeenCalledWith('md2-data:open-project-folder');
    });

    it('wraps lifecycle flush requests and confirmations without exposing ipcRenderer', () => {
        const { electron, exposed } = createPreloadHarness();
        const callback = vi.fn();
        const unsubscribe = exposed.md2Lifecycle.onFlushRequested(callback);
        const listener = electron.ipcRenderer.on.mock.calls[0][1];

        const request = { reason: 'app-quit', requestId: 'quit-1' };
        const result = { requestId: 'quit-1', success: true };
        listener({ sender: 'internal' }, request);
        exposed.md2Lifecycle.reportFlushResult(result);
        unsubscribe();

        expect(electron.ipcRenderer.on).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits', expect.any(Function));
        expect(callback).toHaveBeenCalledWith(request);
        expect(electron.ipcRenderer.send).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits-result', result);
        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits', listener);
        expect(exposed.md2Lifecycle.ipcRenderer).toBeUndefined();
    });

    it('blocks privileged bridges and renders a warning for disallowed origins', () => {
        const { document, electron, exposed } = createPreloadHarness({
            href: 'https://evil.example/',
            origin: 'https://evil.example',
        });

        expect(electron.contextBridge.exposeInMainWorld).not.toHaveBeenCalled();
        expect(exposed.md2Data).toBeUndefined();
        expect(exposed.md2Actions).toBeUndefined();
        expect(exposed.md2Config).toBeUndefined();
        expect(document.body.innerHTML).toBe('');
        expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('exposes bridges only to the exact packaged renderer file', () => {
        const trustedLocation = 'file:///C:/Program%20Files/MD2/resources/app.asar/renderer/index.html';
        const allowed = createPreloadHarness({
            allowedOrigins: [],
            href: `${trustedLocation}#board`,
            origin: 'null',
            trustedLocation,
        });
        const blocked = createPreloadHarness({
            allowedOrigins: [],
            href: 'file:///C:/Temp/untrusted.html',
            origin: 'null',
            trustedLocation,
        });

        expect(allowed.exposed.md2Data).toBeDefined();
        expect(blocked.exposed.md2Data).toBeUndefined();
    });

    it('updates cached desktop config only after persistence acknowledgement', async () => {
        const { electron, exposed } = createPreloadHarness();
        const nextConfig = { agent: 'stored-agent', agentProfiles: [{ command: ['stored-agent'], name: 'stored-agent' }], model: '' };
        electron.ipcRenderer.invoke.mockResolvedValueOnce(nextConfig);

        expect(exposed.md2Config.getDesktopConfig()).toEqual({ agent: 'codex', agentProfiles: [{ command: ['codex'], name: 'codex' }], model: '' });
        const savePromise = exposed.md2Config.setDesktopConfig(nextConfig);

        expect(exposed.md2Config.getDesktopConfig()).not.toEqual(nextConfig);
        await expect(savePromise).resolves.toEqual(nextConfig);

        expect(exposed.md2Config.getDesktopConfig()).toEqual(nextConfig);
        expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('md2-config:set-desktop', nextConfig);
    });
});

describe('electron main isolation settings', () => {
    it('creates renderer windows with context isolation and without Node integration', () => {
        const source = readFileSync(mainPath, 'utf8');

        expect(source).toContain('nodeIntegration: false');
        expect(source).toContain('contextIsolation: true');
        expect(source).toContain('sandbox: true');
    });

    it('coordinates renderer flushing before remaining quit cleanup', () => {
        const source = readFileSync(mainPath, 'utf8');

        expect(source).toContain('LIFECYCLE_FLUSH_REQUEST_CHANNEL');
        expect(source).toContain('closeCoordinator.requestApplicationQuit()');
        expect(source).toContain('completeApplicationQuit: () => stopAndQuit()');
    });

    it('opens renderer developer tools when Electron runs unpackaged', () => {
        const source = readFileSync(mainPath, 'utf8');

        expect(source).toContain('if (!app.isPackaged)');
        expect(source).toContain('window.webContents.openDevTools()');
    });
});
