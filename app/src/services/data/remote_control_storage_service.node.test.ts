import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    flushPromises,
    installWebSocket,
    lastSocket,
    MockWebSocket,
    openConnection,
    settle,
    TEST_ENDPOINT,
} from '../test_support/mock_web_socket';
import { RemoteControlStorageService } from './remote_control_storage_service';

const PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const OPERATION_REQUEST = { project: PROJECT, worktree: 1, worktreeBranch: 'feature' };
const MERGE_SESSION_REQUEST = { sessionId: 'session-1' };
const MERGE_PATH_REQUEST = { path: 'src/file.ts', sessionId: 'session-1' };

interface ForwardingCase {
    call: (service: RemoteControlStorageService) => Promise<unknown>;
    method: string;
    params: unknown[];
}

const forwardingCases: ForwardingCase[] = [
    { call: (service) => service.getActiveProject(), method: 'getActiveProject', params: [] },
    { call: (service) => service.listBranches(PROJECT), method: 'listBranches', params: [PROJECT] },
    { call: (service) => service.checkoutBranch(PROJECT, 'topic'), method: 'checkoutBranch', params: [PROJECT, 'topic'] },
    { call: (service) => service.deleteLocalBranch(PROJECT, 'feature'), method: 'deleteLocalBranch', params: [PROJECT, 'feature'] },
    { call: (service) => service.loadProject(PROJECT, 'design'), method: 'loadProject', params: [PROJECT, 'design'] },
    {
        call: (service) => service.loadProject(PROJECT, 'design', 'design/active'),
        method: 'loadProject',
        params: [PROJECT, 'design', 'design/active'],
    },
    { call: (service) => service.loadProjectRoot(PROJECT, 'design'), method: 'loadProjectRoot', params: [PROJECT, 'design'] },
    { call: (service) => service.loadProjectConfig(PROJECT), method: 'loadProjectConfig', params: [PROJECT] },
    { call: (service) => service.loadFile(PROJECT, 'design/F-1.md'), method: 'loadFile', params: [PROJECT, 'design/F-1.md'] },
    { call: (service) => service.loadTextFile(PROJECT, 'design/a.json'), method: 'loadTextFile', params: [PROJECT, 'design/a.json'] },
    { call: (service) => service.loadProjectAsset(PROJECT, 'design/i.png'), method: 'loadProjectAsset', params: [PROJECT, 'design/i.png'] },
    { call: (service) => service.loadImageFile('C:/images/photo.png'), method: 'loadImageFile', params: ['C:/images/photo.png'] },
    { call: (service) => service.listRepositoryFiles(PROJECT), method: 'listRepositoryFiles', params: [PROJECT] },
    { call: (service) => service.listTopLevelFolders(PROJECT), method: 'listTopLevelFolders', params: [PROJECT] },
    { call: (service) => service.loadActionFiles(PROJECT, 'actions'), method: 'loadActionFiles', params: [PROJECT, 'actions'] },
    { call: (service) => service.loadActionSchedules(PROJECT, 'actions'), method: 'loadActionSchedules', params: [PROJECT, 'actions'] },
    { call: (service) => service.saveActionSchedules(PROJECT, 'actions', []), method: 'saveActionSchedules', params: [PROJECT, 'actions', []] },
    {
        call: (service) => service.cancelActionSchedule(PROJECT, 'actions', 'schedule-1'),
        method: 'cancelActionSchedule',
        params: [PROJECT, 'actions', 'schedule-1'],
    },
    { call: (service) => service.loadAgentConversation(PROJECT, 'a.json#c=1'), method: 'loadAgentConversation', params: ['a.json#c=1'] },
    { call: (service) => service.loadActivityConversations(PROJECT, 'a.json'), method: 'loadActivityConversations', params: ['a.json'] },
    {
        call: (service) => service.listAgentConversationReferences(PROJECT, 'design'),
        method: 'listAgentConversationReferences',
        params: [PROJECT, 'design'],
    },
    { call: (service) => service.stopAgent(PROJECT, 'run-1'), method: 'stopAgent', params: ['run-1'] },
    { call: (service) => service.trashPrimaryChange({ path: 'a.md' } as never), method: 'trashPrimaryChange', params: [{ path: 'a.md' }] },
    { call: (service) => service.pull(PROJECT), method: 'pull', params: [PROJECT] },
    { call: (service) => service.selectWorktreeFolder(), method: 'selectWorktreeFolder', params: [] },
    { call: (service) => service.addWorktree(PROJECT, 'C:/feature'), method: 'addWorktree', params: [PROJECT, 'C:/feature'] },
    {
        call: (service) => service.removeWorktree(PROJECT, 'C:/feature', 'files'),
        method: 'removeWorktree',
        params: [PROJECT, 'C:/feature', 'files'],
    },
    {
        call: (service) => service.prepareWorktree({ ...OPERATION_REQUEST, branchName: 'card-title' }),
        method: 'prepareWorktree',
        params: [{ ...OPERATION_REQUEST, branchName: 'card-title' }],
    },
    {
        call: (service) => service.commitWorktree({ ...OPERATION_REQUEST, message: 'F-1: Card' }),
        method: 'commitWorktree',
        params: [{ ...OPERATION_REQUEST, message: 'F-1: Card' }],
    },
    { call: (service) => service.discardWorktreeChanges(OPERATION_REQUEST), method: 'discardWorktreeChanges', params: [OPERATION_REQUEST] },
    { call: (service) => service.parkWorktree(OPERATION_REQUEST), method: 'parkWorktree', params: [OPERATION_REQUEST] },
    { call: (service) => service.pullWorktree(OPERATION_REQUEST), method: 'pullWorktree', params: [OPERATION_REQUEST] },
    { call: (service) => service.rebaseWorktree(OPERATION_REQUEST), method: 'rebaseWorktree', params: [OPERATION_REQUEST] },
    { call: (service) => service.pushWorktree(OPERATION_REQUEST), method: 'pushWorktree', params: [OPERATION_REQUEST] },
    { call: (service) => service.refreshWorktrees(PROJECT), method: 'refreshWorktrees', params: [PROJECT] },
    { call: (service) => service.getMergeConflictSession(), method: 'getMergeConflictSession', params: [] },
    { call: (service) => service.abortMergeConflict(MERGE_SESSION_REQUEST), method: 'abortMergeConflict', params: [MERGE_SESSION_REQUEST] },
    { call: (service) => service.continueMergeConflict(MERGE_SESSION_REQUEST), method: 'continueMergeConflict', params: [MERGE_SESSION_REQUEST] },
    { call: (service) => service.rescanMergeConflict(MERGE_SESSION_REQUEST), method: 'rescanMergeConflict', params: [MERGE_SESSION_REQUEST] },
    {
        call: (service) => service.launchMergeConflictResolver(MERGE_PATH_REQUEST),
        method: 'launchMergeConflictResolver',
        params: [MERGE_PATH_REQUEST],
    },
    {
        call: (service) => service.markMergeConflictResolved(MERGE_PATH_REQUEST),
        method: 'markMergeConflictResolved',
        params: [MERGE_PATH_REQUEST],
    },
    {
        call: (service) => service.writeFiles({ branch: 'main', files: [{ content: '# New', path: 'design/F-1.md' }] }),
        method: 'writeFiles',
        params: [{ branch: 'main', files: [{ content: '# New', path: 'design/F-1.md' }] }],
    },
];

const pendingPushCases: ForwardingCase[] = [
    { call: (service) => service.commit({ branch: 'main', files: [], message: 'Commit' }), method: 'commit', params: [] },
    { call: (service) => service.deleteFile({ branch: 'main', message: 'Delete', path: 'a.md' }), method: 'deleteFile', params: [] },
    { call: (service) => service.deleteFolder({ branch: 'main', message: 'Delete', path: 'notes' }), method: 'deleteFolder', params: [] },
    { call: (service) => service.moveFiles({ branch: 'main', moves: [] } as never), method: 'moveFiles', params: [] },
    {
        call: (service) => service.integrateWorktree({ ...OPERATION_REQUEST, cardInternalId: 'card-1', projectFolder: 'design' }),
        method: 'integrateWorktree',
        params: [],
    },
    { call: (service) => service.commitPrimaryChanges({ message: 'Primary', project: PROJECT } as never), method: 'commitPrimaryChanges', params: [] },
    { call: (service) => service.saveProjectConfig(PROJECT, {} as never), method: 'saveProjectConfig', params: [] },
];

function createService() {
    const service = new RemoteControlStorageService();
    service.client.init({ endpoint: TEST_ENDPOINT });

    return service;
}

async function respond(socket: MockWebSocket, result: unknown) {
    socket.receive({ id: socket.request(-1).id, result });
    await flushPromises();
}

describe('RemoteControlStorageService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(forwardingCases)('forwards $method with unchanged parameters', async ({ call, method, params }) => {
        installWebSocket();
        const service = createService();
        const result = call(service);
        const socket = lastSocket();
        socket.open();
        await flushPromises();

        expect(socket.request(0)).toMatchObject({ method, params });
        expect(socket.request(0).params).toHaveLength(params.length);
        await respond(socket, null);
        await result;
        expect(service.hasPendingPush(PROJECT)).toBe(false);
    });

    it.each(pendingPushCases)('marks the affected branch as pending push after $method', async ({ call, method }) => {
        installWebSocket();
        const service = createService();
        const socket = await openConnection(service.client);
        const result = call(service);
        await flushPromises();

        expect(socket.request(0).method).toBe(method);
        expect(service.hasPendingPush(PROJECT)).toBe(false);
        await respond(socket, null);
        await result;
        expect(service.hasPendingPush(PROJECT)).toBe(true);
        expect(service.hasPendingPush({ ...PROJECT, branch: 'other' })).toBe(false);
    });

    it('clears the pending push of the branch after a primary push', async () => {
        installWebSocket();
        const service = createService();
        const socket = await openConnection(service.client);
        const commit = service.commit({ branch: 'main', files: [], message: 'Commit' });
        await flushPromises();
        await respond(socket, []);
        await commit;

        const push = service.push(PROJECT);
        await flushPromises();
        expect(socket.request(-1)).toMatchObject({ method: 'push', params: [PROJECT] });
        await respond(socket, null);
        await push;

        expect(service.hasPendingPush(PROJECT)).toBe(false);
    });

    it('replaces cached pending-push state with the host result', async () => {
        installWebSocket();
        const service = createService();
        const socket = await openConnection(service.client);
        const firstLoad = service.loadPendingPush(PROJECT);
        await flushPromises();
        expect(socket.request(0)).toMatchObject({ method: 'hasPendingPush', params: [PROJECT] });
        await respond(socket, true);
        await firstLoad;
        expect(service.hasPendingPush(PROJECT)).toBe(true);

        const secondLoad = service.loadPendingPush(PROJECT);
        await flushPromises();
        await respond(socket, false);
        await secondLoad;
        expect(service.hasPendingPush(PROJECT)).toBe(false);
    });

    it('lists no repositories without a remote request after initialization', async () => {
        installWebSocket();

        await expect(new RemoteControlStorageService().listRepositories()).rejects.toThrow('Remote-control storage is not initialized');
        await expect(createService().listRepositories()).resolves.toEqual([]);
        expect(MockWebSocket.instances).toEqual([]);
    });

    it('reports its connection settings and connection changes', async () => {
        installWebSocket();
        const service = createService();
        const listener = vi.fn();
        service.client.onConnectionChanged(listener);
        const socket = await openConnection(service.client);
        service.client.disconnect();

        expect(service.client.getConnectionSettings()).toEqual({ endpoint: TEST_ENDPOINT });
        expect(socket.readyState).toBe(3);
        expect(listener.mock.calls).toEqual([[true], [false]]);
    });

    it('rejects requests after retirement without creating a socket', async () => {
        installWebSocket();
        const service = createService();
        service.client.retire();

        await expect(service.getActiveProject()).rejects.toThrow('Remote-control connection was replaced');
        await expect(service.actionBridge.startAction({ actionId: 'review', context: { kind: 'project' }, runInput: {} }))
            .rejects.toThrow('Remote-control connection was replaced');
        expect(MockWebSocket.instances).toEqual([]);
    });

    it('delivers worktree state and merge-conflict sessions through their server subscriptions', async () => {
        installWebSocket();
        const service = createService();
        const worktreeCallback = vi.fn();
        const mergeConflictCallback = vi.fn();
        service.onWorktreesChanged(worktreeCallback);
        service.onMergeConflictSessionChanged(mergeConflictCallback);
        const socket = lastSocket();
        socket.open();
        await flushPromises();
        const [worktreeRequest, mergeConflictRequest] = [socket.request(0), socket.request(1)];
        const state = { error: null, primaryStatus: null, project: PROJECT, records: [] };
        const session = { id: 'session-1' };

        expect(socket.methods()).toEqual(['onWorktreesChanged', 'onMergeConflictSessionChanged']);
        socket.receive({ event: 'worktreesChanged', payload: { requestId: worktreeRequest.id, state, subscriptionId: 'worktrees-1' } });
        socket.receive({
            event: 'mergeConflictSessionChanged',
            payload: { requestId: mergeConflictRequest.id, session, subscriptionId: 'conflict-1' },
        });

        expect(worktreeCallback).toHaveBeenCalledWith(state);
        expect(mergeConflictCallback).toHaveBeenCalledWith(session);
    });

    it('watches a project through its server subscription', async () => {
        installWebSocket();
        const service = createService();
        const onChange = vi.fn();
        const stop = service.watchProject(PROJECT, onChange, vi.fn(), vi.fn());
        const socket = lastSocket();
        socket.open();
        await flushPromises();
        expect(socket.request(0)).toMatchObject({ method: 'watchProject', params: [PROJECT] });
        await respond(socket, { subscriptionId: 'watch-1' });
        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: 'other', subscriptionId: 'watch-1' },
        });
        stop();

        expect(onChange).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' });
        expect(socket.request(-1)).toMatchObject({ method: 'unsubscribe', params: ['watch-1'] });
    });

    it('shares one client between storage and its adapters', async () => {
        installWebSocket();
        const service = createService();
        const socket = await openConnection(service.client);
        const storageRequest = service.getActiveProject();
        const actionRequest = service.actionBridge.listActiveActionRuns();
        const claudeRequest = service.claudeRuntimeBridge.getClaudeRateLimits('claude-1');
        const codexRequest = service.codexRuntimeBridge.getCodexRateLimits('codex-1');
        const configRequest = service.desktopConfigTransport.loadDesktopConfig();
        await flushPromises();

        expect(MockWebSocket.instances).toHaveLength(1);
        expect(socket.methods()).toEqual([
            'getActiveProject', 'listActiveActionRuns', 'getClaudeRateLimits', 'getCodexRateLimits', 'loadDesktopConfig',
        ]);
        for (const [index] of socket.sent.entries()) socket.receive({ id: socket.request(index).id, result: null });
        await Promise.all([storageRequest, actionRequest, claudeRequest, codexRequest, configRequest]);
    });

    it('keeps sockets, subscriptions, and pending-push state isolated per instance', async () => {
        installWebSocket();
        const first = createService();
        const second = createService();
        const firstSocket = await openConnection(first.client);
        const secondSocket = await openConnection(second.client);
        first.onWorktreesChanged(vi.fn());
        const commit = first.commit({ branch: 'main', files: [], message: 'Commit' });
        await settle();

        expect(firstSocket.methods()).toEqual(['onWorktreesChanged', 'commit']);
        expect(secondSocket.sent).toEqual([]);
        firstSocket.receive({ id: firstSocket.request(1).id, result: [] });
        await commit;
        expect(first.hasPendingPush(PROJECT)).toBe(true);
        expect(second.hasPendingPush(PROJECT)).toBe(false);
    });
});
