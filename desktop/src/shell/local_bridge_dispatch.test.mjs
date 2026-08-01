import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch');

function createDispatch(options = {}) {
    const agentExecutableAvailability = vi.fn(async () => ({ codex: { available: true, error: null } }));
    const actionRunnerService = {
        answerAgentApproval: vi.fn(),
        answerAgentQuestion: vi.fn(),
        beginAgentPromptDraft: vi.fn(() => 2),
        cancel: vi.fn(),
        finishAgentRun: vi.fn(),
        handleCardStateChange: vi.fn(),
        loadActiveRunEvents: vi.fn(() => [{ runId: 'run-1', sequence: 1 }]),
        prepareActionPrompt: vi.fn(async () => ({ prompt: 'Prepared prompt' })),
        requireActionsFolder: vi.fn(() => 'actions'),
        requireProjectFolder: vi.fn(() => 'design'),
        start: vi.fn(async () => 'action-1'),
        subscribe: vi.fn(() => vi.fn()),
        sendAgentMessage: vi.fn(),
        sendQueuedAgentMessage: vi.fn(),
        setAgentQueuedMessage: vi.fn(),
    };
    const actionSchedulerService = {
        registerActionSchedule: vi.fn(async () => ({ id: 'schedule-1' })),
        startProject: vi.fn(),
        subscribeRunEvents: vi.fn(() => vi.fn()),
    };
    const agentRunnerService = {
        run: vi.fn(async () => ({ runId: 'run-1' })),
        start: vi.fn(async () => ({ runId: 'run-2' })),
        stop: vi.fn(),
    };
    const codexRuntimeService = {
        getSnapshot: vi.fn(() => ({ available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null })),
        subscribe: vi.fn(() => vi.fn()),
    };
    const localGitService = {
        appendAndCommitSystemActivity: vi.fn(async () => undefined),
        assertGitRoot: vi.fn(),
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        hasPendingPush: vi.fn(async () => false),
        listAgentConversationReferences: vi.fn(async () => ['design/activity/project.json#conversation=conversation-1']),
        loadFile: vi.fn(async () => ({ content: '# Root', path: 'design/F-1.md' })),
        loadActionFiles: vi.fn(async () => options.actionFiles ?? [{
            content: JSON.stringify({
                command: 'npm test {{card-file}} {{card-prompt}}',
                description: 'Run tests',
                id: 'test',
                label: 'Test',
                type: 'command',
            }),
            path: 'actions/test.json',
        }]),
        loadActionRunHistory: vi.fn(async () => []),
        loadCardActivity: vi.fn(async () => ({ conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 1 })),
        loadProjectAsset: vi.fn(async () => ({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' })),
        loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        resolveLocalProject: vi.fn(async () => ({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })),
        readFileAtCommit: vi.fn(async () => ({ content: '# Card', exists: true })),
        resolveCommitMetadata: vi.fn(async (_rootPath, commit) => ({
            commit,
            committedAt: '2026-07-30T12:00:00.000Z',
            deletions: 1,
            filePaths: ['design/F-1.md'],
            filesChanged: 1,
            insertions: 2,
        })),
        runCommand: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: 'ok' })),
        push: vi.fn(async () => undefined),
        watchProject: vi.fn(() => vi.fn()),
    };
    const actionWorktreeRunService = {
        execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
            ...await runner(primaryProject),
            branch: primaryProject.branch,
            repositoryRoot: primaryProject.rootPath,
        })),
        resolve: vi.fn(async (primaryProject) => ({ runProject: primaryProject, transferRecord: null })),
        runWithCardLock: vi.fn(async (_primaryProject, _context, operation) => operation()),
    };
    const worktreeService = {
        add: vi.fn(async () => undefined),
        commit: vi.fn(async () => undefined),
        discard: vi.fn(async () => undefined),
        getRecords: vi.fn(() => []),
        integrate: vi.fn(async () => ({ branch: 'main', commit: 'a'.repeat(40) })),
        park: vi.fn(async () => undefined),
        prepare: vi.fn(async () => undefined),
        pull: vi.fn(async () => undefined),
        pullPrimary: vi.fn(async () => undefined),
        push: vi.fn(async () => undefined),
        refreshLocal: vi.fn(async () => undefined),
        refreshRemote: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        resolvePath: vi.fn(),
        startProject: vi.fn(async () => undefined),
        subscribe: vi.fn(() => vi.fn()),
    };
    const desktopConfig = options.desktopConfig ?? {agent: 'codex', agentProfiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }], model: 'gpt-5'};
    const dispatch = createLocalBridgeDispatch({
        actionRunnerService,
        actionSchedulerService,
        actionWorktreeRunService,
        agentExecutableAvailability,
        agentRunnerService,
        codexRuntimeService,
        desktopConfigStore: {},
        diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
        localGitService,
        openProjectFolder: options.openProjectFolder,
        openWorktreeFolder: options.openWorktreeFolder,
        readDesktopConfig: () => desktopConfig,
        worktreeService,
    });

    return {
        actionRunnerService,
        actionSchedulerService,
        agentExecutableAvailability,
        agentRunnerService,
        codexRuntimeService,
        dispatch,
        localGitService,
        worktreeService,
    };
}

describe('createLocalBridgeDispatch', () => {
    it('exposes account-wide Codex runtime state without execution context', () => {
        const { codexRuntimeService, dispatch } = createDispatch();
        const callback = vi.fn();

        expect(dispatch.codexRuntimeBridge.getCodexRateLimits()).toEqual({
            available: true,
            buckets: [],
            observedAt: 10,
            rateLimitResetCredits: null,
        });
        dispatch.codexRuntimeBridge.onCodexRateLimits(callback);
        expect(codexRuntimeService.subscribe).toHaveBeenCalledWith(callback);
    });

    it('loads executable availability from configured profiles', async () => {
        const { agentExecutableAvailability, dispatch } = createDispatch();

        await expect(dispatch.dataBridge.loadAgentAvailability()).resolves.toEqual({ codex: { available: true, error: null } });
        expect(agentExecutableAvailability).toHaveBeenCalledWith([{ command: ['codex'], models: ['gpt-5'], name: 'codex' }]);
    });

    it('forwards pending push checks to the local Git service', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.hasPendingPush(project)).resolves.toBe(false);
        expect(localGitService.hasPendingPush).toHaveBeenCalledWith(project);
    });

    it('establishes a created project for following commits', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.createProject(project, 'design/active');
        localGitService.commit.mockResolvedValueOnce(undefined);
        const result = await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Add defaults' });

        expect(localGitService.createProject).toHaveBeenCalledWith(project, 'design/active');
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), project);
        expect(result).toEqual([]);
    });

    it('opens a selected folder as a normalized project and establishes it for project operations', async () => {
        const openProjectFolder = vi.fn(async () => 'C:/repo/nested');
        const { actionSchedulerService, dispatch, localGitService } = createDispatch({ openProjectFolder });

        const project = await dispatch.dataBridge.openProjectFolder();
        await dispatch.dataBridge.commit({ branch: 'topic', files: [], message: 'Update' });

        expect(localGitService.resolveLocalProject).toHaveBeenCalledWith('C:/repo/nested');
        expect(project).toEqual({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' });
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project);
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), project);
    });

    it('leaves the current project unchanged when folder selection is cancelled', async () => {
        const { dispatch, localGitService } = createDispatch({ openProjectFolder: vi.fn(async () => null) });
        const currentProject = { branch: 'main', id: 'current', rootPath: 'C:/current' };
        await dispatch.dataBridge.loadProject(currentProject, 'design');

        await expect(dispatch.dataBridge.openProjectFolder()).resolves.toBeNull();
        await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Update' });

        expect(localGitService.resolveLocalProject).not.toHaveBeenCalled();
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), currentProject);
    });

    it('reloads current project data without restarting project services', async () => {
        const { actionSchedulerService, dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadProject(project, 'design');
        await dispatch.dataBridge.loadProject(project, 'design');
        await dispatch.dataBridge.loadProjectRoot(project, 'design');

        expect(localGitService.loadProject).toHaveBeenCalledTimes(2);
        expect(localGitService.loadProjectRoot).toHaveBeenCalledOnce();
        expect(actionSchedulerService.startProject).toHaveBeenCalledOnce();
        expect(worktreeService.startProject).toHaveBeenCalledOnce();
    });

    it('adds a worktree at the selected folder and returns the picker status', async () => {
        const openWorktreeFolder = vi.fn(async () => 'C:/feature');
        const { dispatch, worktreeService } = createDispatch({ openWorktreeFolder });
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.addWorktree(project)).resolves.toBe(true);
        expect(worktreeService.add).toHaveBeenCalledWith(project, 'C:/feature');
    });

    it('delegates linked worktree removal', async () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.removeWorktree(project, 'C:/feature')).resolves.toBeUndefined();
        expect(worktreeService.remove).toHaveBeenCalledWith(project, 'C:/feature');
    });

    it('delegates card worktree preparation', async () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { branchName: 'card-title', project, worktree: 1 };

        await expect(dispatch.dataBridge.prepareWorktree(request)).resolves.toBeUndefined();
        expect(worktreeService.prepare).toHaveBeenCalledWith(project, 1, 'card-title');
    });

    it('delegates card worktree lifecycle operations', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { project, worktree: 1 };

        await dispatch.dataBridge.commitWorktree({ ...request, message: 'F-1: Card' });
        await dispatch.dataBridge.discardWorktreeChanges(request);
        await dispatch.dataBridge.integrateWorktree(request);
        await dispatch.dataBridge.parkWorktree(request);
        await dispatch.dataBridge.pullWorktree(request);
        await dispatch.dataBridge.pushWorktree(request);
        await dispatch.dataBridge.refreshWorktrees(project);

        expect(worktreeService.commit).toHaveBeenCalledWith(project, 1, 'F-1: Card');
        expect(worktreeService.discard).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.integrate).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.park).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.pull).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.push).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.refreshRemote).toHaveBeenCalledWith(project);
        expect(localGitService.appendAndCommitSystemActivity).not.toHaveBeenCalled();
    });

    it('tracks a card integration under its stable internal id', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { cardInternalId: 'stable-card-id', project, projectFolder: 'design', worktree: 1 };

        await dispatch.dataBridge.integrateWorktree(request);

        const origin = { cardInternalId: 'stable-card-id', kind: 'card' };
        expect(worktreeService.integrate).toHaveBeenCalledWith(project, 1);
        expect(localGitService.resolveCommitMetadata).toHaveBeenCalledWith(project.rootPath, 'a'.repeat(40));
        expect(localGitService.appendAndCommitSystemActivity).toHaveBeenCalledWith(
            project,
            'design',
            origin,
            {
                commits: [{
                    branch: 'main',
                    commit: 'a'.repeat(40),
                    committedAt: '2026-07-30T12:00:00.000Z',
                    deletions: 1,
                    filePaths: ['design/F-1.md'],
                    filesChanged: 1,
                    insertions: 2,
                }],
                completedAt: '2026-07-30T12:00:00.000Z',
                label: 'Integrate into project',
                origin,
                type: 'system',
            },
            'Record Integrate into project activity',
        );
    });

    it('reports history persistence failure after successful card integration', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        localGitService.appendAndCommitSystemActivity.mockRejectedValueOnce(new Error('activity commit failed'));

        await expect(dispatch.dataBridge.integrateWorktree({
            cardInternalId: 'card-1',
            project,
            projectFolder: 'design',
            worktree: 1,
        })).rejects.toThrow('Worktree integrated, but card history tracking failed: activity commit failed');

        expect(worktreeService.integrate).toHaveBeenCalledOnce();
    });

    it('writes no activity when card integration fails', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        worktreeService.integrate.mockRejectedValueOnce(new Error('squash failed'));

        await expect(dispatch.dataBridge.integrateWorktree({
            cardInternalId: 'card-1',
            project,
            projectFolder: 'design',
            worktree: 1,
        })).rejects.toThrow('squash failed');

        expect(localGitService.appendAndCommitSystemActivity).not.toHaveBeenCalled();
    });

    it('delegates primary pull and refreshes monitored state after push', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.pull(project);
        await dispatch.dataBridge.push(project);

        expect(worktreeService.pullPrimary).toHaveBeenCalledWith(project);
        expect(localGitService.push).toHaveBeenCalledWith(project);
        expect(worktreeService.refreshLocal).toHaveBeenCalledOnce();
    });

    it('revalidates and normalizes a stored local project', async () => {
        const { actionSchedulerService, dispatch, localGitService } = createDispatch();
        const storedProject = { branch: 'main', id: 'C:/repo/nested', rootPath: 'C:/repo/nested' };

        const project = await dispatch.dataBridge.resolveProject(storedProject);

        expect(localGitService.resolveLocalProject).toHaveBeenCalledWith(storedProject.rootPath);
        expect(project).toEqual({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' });
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project);
    });

    it('delegates safe action start requests to the shared runner', async () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { actionId: 'test', context: { file: 'design/F-1.md', kind: 'card' }, runInput: { extraPrompt: 'focus' } };

        await dispatch.dataBridge.loadProject(project, 'design');
        await expect(dispatch.actionBridge.startAction(request)).resolves.toBe('action-1');

        expect(actionRunnerService.start).toHaveBeenCalledWith(request);
    });

    it('delegates prompt preparation to the shared runner', async () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const request = { actionId: 'test', context: { file: 'design/F-1.md', kind: 'card' } };

        await expect(dispatch.actionBridge.prepareActionPrompt(request)).resolves.toEqual({ prompt: 'Prepared prompt' });
        expect(actionRunnerService.prepareActionPrompt).toHaveBeenCalledWith(request);
    });

    it('delegates cancellation and streaming interaction by run ID', async () => {
        const { actionRunnerService, dispatch } = createDispatch();

        await dispatch.actionBridge.cancelActionRun('action-1');
        await dispatch.actionBridge.sendActionMessage('action-1', 'approved');
        expect(dispatch.actionBridge.beginActionPromptDraft('action-1')).toBe(2);
        await dispatch.actionBridge.setActionQueuedMessage('action-1', 2, 'next', 3);
        await dispatch.actionBridge.sendActionQueuedMessage('action-1', 2, 3);
        await dispatch.actionBridge.answerActionApproval('action-1', 41, 'accept');
        await dispatch.actionBridge.answerActionQuestion('action-1', 7, { confirm: ['Yes'] });
        await dispatch.actionBridge.finishActionRun('action-1');

        expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1');
        expect(actionRunnerService.sendAgentMessage).toHaveBeenCalledWith('action-1', 'approved');
        expect(actionRunnerService.beginAgentPromptDraft).toHaveBeenCalledWith('action-1');
        expect(actionRunnerService.setAgentQueuedMessage).toHaveBeenCalledWith('action-1', 2, 'next', 3);
        expect(actionRunnerService.sendQueuedAgentMessage).toHaveBeenCalledWith('action-1', 2, 3);
        expect(actionRunnerService.answerAgentApproval).toHaveBeenCalledWith('action-1', 41, 'accept');
        expect(actionRunnerService.answerAgentQuestion).toHaveBeenCalledWith('action-1', 7, { confirm: ['Yes'] });
        expect(actionRunnerService.finishAgentRun).toHaveBeenCalledWith('action-1');
    });

    it('delegates card-state auto-finish events to every local run', async () => {
        const { actionRunnerService, dispatch } = createDispatch();

        await dispatch.actionBridge.notifyActionCardStateChange('card-1', 'ready');

        expect(actionRunnerService.handleCardStateChange).toHaveBeenCalledWith('card-1', 'ready');
    });

    it('marks unattended starts before delegating to the runner', async () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const request = { actionId: 'test', context: { kind: 'project' }, runInput: {} };

        await dispatch.actionBridge.startUnattendedAction(request);

        expect(actionRunnerService.start).toHaveBeenCalledWith(request, { interactive: false });
    });

    it('owns search-agent command and prompt construction in Electron', async () => {
        const { agentRunnerService, dispatch } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.runSearchRegexpAgent('find beta cards', vi.fn());

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({activityOrigin: { kind: 'project' }, command: ['codex', '--search', 'exec', '--json'], prompt: expect.stringContaining('find beta cards')}), expect.any(Function));
    });

    it('invokes shared method table for remote control', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.invoke('loadProjectRoot', [project, 'design']);

        expect(localGitService.loadProjectRoot).toHaveBeenCalledWith(project, 'design');
    });

    it('forwards single file reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadFile(project, 'design/F-1.md');

        expect(localGitService.loadFile).toHaveBeenCalledWith(project, 'design/F-1.md');
    });

    it('forwards agent conversation reference listing through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.listAgentConversationReferences(project, 'design')).resolves.toEqual([
            'design/activity/project.json#conversation=conversation-1',
        ]);
        expect(localGitService.listAgentConversationReferences).toHaveBeenCalledWith(project, 'design');
    });

    it('forwards project asset reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadProjectAsset(project, 'actions/icon.png');

        expect(localGitService.loadProjectAsset).toHaveBeenCalledWith(project, 'actions/icon.png');
    });

    it('exposes shared action run subscriptions through the action bridge', () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const callback = vi.fn();

        dispatch.actionBridge.onActionRun(callback);

        expect(actionRunnerService.subscribe).toHaveBeenCalledWith(callback);
    });

    it('loads active action run events through the action bridge', () => {
        const { actionRunnerService, dispatch } = createDispatch();

        const events = dispatch.actionBridge.loadActiveActionRunEvents();

        expect(events).toEqual([{ runId: 'run-1', sequence: 1 }]);
        expect(actionRunnerService.loadActiveRunEvents).toHaveBeenCalledOnce();
    });

    it('exposes worktree state subscriptions through the data bridge', () => {
        const { dispatch, worktreeService } = createDispatch();
        const callback = vi.fn();

        dispatch.dataBridge.onWorktreesChanged(callback);

        expect(worktreeService.subscribe).toHaveBeenCalledWith(callback);
    });

    it('loads history with the runner-owned actions folder and shared definition resolver', async () => {
        const { actionRunnerService, dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { actionId: 'test', context: { file: 'design/F-1.md', kind: 'card' } };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.loadActionRunHistory(request);

        expect(actionRunnerService.requireProjectFolder).toHaveBeenCalled();
        expect(localGitService.loadActionRunHistory).toHaveBeenCalledWith(project, { ...request, projectFolder: 'design' });
    });

    it('loads card activity and historical files through the primary checkout', async () => {
        const { actionRunnerService, dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const fileRequest = { commit: 'a'.repeat(40), parent: false, path: 'design/F-1.md' };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.loadCardActivity({ cardInternalId: 'card-1' });
        await dispatch.actionBridge.readFileAtCommit(fileRequest);

        expect(actionRunnerService.requireProjectFolder).toHaveBeenCalled();
        expect(localGitService.loadCardActivity).toHaveBeenCalledWith(project, 'design', 'card-1', []);
        expect(localGitService.readFileAtCommit).toHaveBeenCalledWith(project, fileRequest);
    });

});
