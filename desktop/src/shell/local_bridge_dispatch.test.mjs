import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch');

function createDispatch(options = {}) {
    const agentExecutableAvailability = vi.fn(async () => ({ codex: { available: true, error: null } }));
    const actionRunnerService = {
        answerAgentApproval: vi.fn(),
        answerAgentQuestion: vi.fn(),
        cancel: vi.fn(),
        deleteQueuedAgentPrompt: vi.fn(async () => ({ deleted: true })),
        editQueuedAgentPrompt: vi.fn(async (_runId, _promptId, _revision, content) => ({ content })),
        enqueueAgentPrompt: vi.fn(async (_runId, content) => ({ content })),
        dismissAgentQuestions: vi.fn(),
        finishAgentRun: vi.fn(),
        handleCardStateChange: vi.fn(),
        loadRunRecoverySnapshot: vi.fn((rendererRunIds) => ({
            activeRunEvents: [{ runId: 'run-1', sequence: 1 }],
            terminalResults: rendererRunIds.map((runId) => ({ failure: null, runId, status: 'completed' })),
        })),
        prepareActionPrompt: vi.fn(async () => ({ prompt: 'Prepared prompt' })),
        requireActionsFolder: vi.fn(() => 'actions'),
        requireProjectFolder: vi.fn(() => 'design'),
        restart: vi.fn(async () => 'action-2'),
        start: vi.fn(async () => 'action-1'),
        subscribe: vi.fn(() => vi.fn()),
        sendAgentMessage: vi.fn(),
        startProject: vi.fn(),
    };
    const actionSchedulerService = {
        registerActionSchedule: vi.fn(async () => ({ id: 'schedule-1' })),
        startProject: vi.fn(),
        subscribeRunEvents: vi.fn(() => vi.fn()),
    };
    const agentRunnerService = {
        requestProjectUsageRefresh: vi.fn(),
        run: vi.fn(async () => ({ runId: 'run-1' })),
        start: vi.fn(async () => ({ runId: 'run-2' })),
        stop: vi.fn(),
    };
    const codexRuntimeService = {
        getSnapshot: vi.fn(() => ({ available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null })),
        subscribe: vi.fn(() => vi.fn()),
        subscribeUpdateRequired: vi.fn(() => vi.fn()),
    };
    const claudeRuntimeService = {
        getSnapshot: vi.fn(() => ({ available: true, observedAt: 11, windows: [] })),
        subscribe: vi.fn(() => vi.fn()),
    };
    const updateCodexCli = vi.fn(async () => undefined);
    const localGitService = {
        appendAndCommitSystemActivity: vi.fn(async () => undefined),
        assertGitRoot: vi.fn(),
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        closeWaitingActivityConversation: vi.fn(async (_project, reference, status) => ({ path: reference, status })),
        updateActivityConversationViewed: vi.fn(async (_project, reference, viewed) => ({ path: reference, viewed })),
        updateCardActionSettings: vi.fn(async () => undefined),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        hasPendingPush: vi.fn(async () => false),
        listAgentConversationReferences: vi.fn(async () => ['design/activity/project.json#conversation=conversation-1']),
        loadActivityConversations: vi.fn(async () => []),
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
        loadCardActivity: vi.fn(async () => ({ actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 4 })),
        loadProjectAsset: vi.fn(async () => ({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' })),
        loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', states: [{ state: 'ready' }] })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadTextFile: vi.fn(async (_project, path) => ({ content: '{"version":2}', path })),
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
        deleteBranch: vi.fn(async () => undefined),
        discard: vi.fn(async () => undefined),
        getRecords: vi.fn(() => []),
        integrate: vi.fn(async () => ({ branch: 'main', commit: 'a'.repeat(40), status: 'completed' })),
        abortConflict: vi.fn(async () => undefined),
        completeConflict: vi.fn(),
        continueConflict: vi.fn(),
        deleteBranchConflict: vi.fn(async () => undefined),
        park: vi.fn(async () => undefined),
        parkConflict: vi.fn(async () => undefined),
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
        synchronize: vi.fn(async () => undefined),
        synchronizeConflict: vi.fn(async () => undefined),
    };
    const mergeConflictService = {
        addEventListener: vi.fn(),
        getInternalSession: vi.fn(() => null),
        getSnapshot: vi.fn(() => null),
        launchResolver: vi.fn(),
        markResolved: vi.fn(),
        removeEventListener: vi.fn(),
        rescan: vi.fn(),
        updateMetadata: vi.fn((_request, updates) => updates),
        verify: vi.fn(async () => null),
    };
    const desktopConfig = options.desktopConfig ?? {
        agentProfiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }],
        agentSelection: {
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-5', thinkingLevel: 'none' } },
        },
        editorCommand: 'code -g "{{file}}:{{line}}"',
    };
    const saveDesktopConfig = vi.fn((_store, values) => values);
    const diffService = { generateDiff: vi.fn(), generateWorktreeDiff: vi.fn(), openInEditor: vi.fn() };
    const projectStatsWorkerService = {
        calculate: vi.fn(async () => ({ stats: { actions: [], conversations: [] }, warnings: [] })),
        cancel: vi.fn(async () => undefined),
    };
    const dispatch = createLocalBridgeDispatch({
        actionRunnerService,
        actionSchedulerService,
        actionWorktreeRunService,
        agentExecutableAvailability,
        agentRunnerService,
        claudeRuntimeService,
        codexRuntimeService,
        desktopConfigStore: {},
        diffService,
        localGitService,
        mergeConflictService,
        openProjectFolder: options.openProjectFolder,
        openProjectSubFolder: options.openProjectSubFolder,
        openWorktreeFolder: options.openWorktreeFolder,
        projectStatsWorkerService,
        readDesktopConfig: () => desktopConfig,
        saveDesktopConfig,
        updateCodexCli,
        worktreeService,
    });

    return {
        actionRunnerService,
        actionSchedulerService,
        agentExecutableAvailability,
        agentRunnerService,
        claudeRuntimeService,
        codexRuntimeService,
        dispatch,
        diffService,
        localGitService,
        mergeConflictService,
        projectStatsWorkerService,
        saveDesktopConfig,
        updateCodexCli,
        worktreeService,
    };
}

describe('createLocalBridgeDispatch', () => {
    it('forwards project watcher failures to the bridge subscriber', () => {
        const { dispatch, localGitService } = createDispatch();
        const callback = vi.fn();
        const error = new Error('Native watcher unavailable');

        dispatch.invoke('watchProject', [{ branch: 'main', id: 'local', rootPath: 'C:/repo' }, callback]);
        const [, , onError] = localGitService.watchProject.mock.calls[0];
        onError(error);

        expect(callback).toHaveBeenCalledWith({ error: error.message });
    });

    it('loads and saves desktop config without requiring an active project', async () => {
        const desktopConfig = {
            agentProfiles: [{ command: ['custom'], models: ['model'], name: 'custom' }],
            agentSelection: {
                activeAgent: 'custom', permissionMode: 'ask-for-approval',
                settingsByAgent: { custom: { model: 'model', thinkingLevel: 'high' } },
            },
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
        };
        const { dispatch, saveDesktopConfig } = createDispatch({ desktopConfig });

        expect(dispatch.invoke('loadDesktopConfig')).toEqual(desktopConfig);
        expect(dispatch.invoke('saveDesktopConfig', [desktopConfig])).toEqual(desktopConfig);
        expect(saveDesktopConfig).toHaveBeenCalledWith(expect.any(Object), desktopConfig);
    });

    it('opens chat and diff files through shared configured editor launcher inputs', async () => {
        const editorCommand = 'notepad "{{file}}"';
        const desktopConfig = {
            agentProfiles: [],
            agentSelection: {
                activeAgent: 'codex', permissionMode: 'ask-for-approval',
                settingsByAgent: { codex: { model: '', thinkingLevel: 'none' } },
            },
            editorCommand,
        };
        const { diffService, dispatch, worktreeService } = createDispatch({ desktopConfig });
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        worktreeService.getRecords.mockReturnValue([
            { path: 'C:/worktree', valid: true },
            { path: 'C:/broken', valid: false },
        ]);
        await dispatch.dataBridge.loadProject(project, 'design');
        const request = { line: 7, path: 'src/file.js', repositoryRoot: 'C:/worktree' };

        await dispatch.actionBridge.openInEditor(request);

        expect(diffService.openInEditor).toHaveBeenCalledWith(project, request, {
            editorCommand,
            worktreeRoots: ['C:/worktree'],
        });
    });

    it('generates worktree diff only through current project and WorktreeService', async () => {
        const { diffService, dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const result = { files: [], repositoryRoot: 'C:/worktree' };
        diffService.generateWorktreeDiff.mockResolvedValue(result);
        await dispatch.dataBridge.loadProject(project, 'design');

        await expect(dispatch.actionBridge.generateWorktreeDiff({ worktree: 1 })).resolves.toBe(result);

        expect(diffService.generateWorktreeDiff).toHaveBeenCalledWith(project, { worktree: 1 }, worktreeService);
        expect(localGitService.appendAndCommitSystemActivity).not.toHaveBeenCalled();
    });

    it('exposes account-wide Codex runtime state without execution context', async () => {
        const { codexRuntimeService, dispatch, updateCodexCli } = createDispatch();
        const callback = vi.fn();
        const updateCallback = vi.fn();

        expect(dispatch.codexRuntimeBridge.getCodexRateLimits()).toEqual({
            available: true,
            buckets: [],
            observedAt: 10,
            rateLimitResetCredits: null,
        });
        dispatch.codexRuntimeBridge.onCodexRateLimits(callback);
        expect(codexRuntimeService.subscribe).toHaveBeenCalledWith(callback);
        dispatch.codexRuntimeBridge.onCodexUpdateRequired(updateCallback);
        expect(codexRuntimeService.subscribeUpdateRequired).toHaveBeenCalledWith(updateCallback);
        await dispatch.codexRuntimeBridge.updateCodexCli();
        expect(updateCodexCli).toHaveBeenCalledOnce();
    });

    it('exposes account-wide Claude runtime state without execution context', () => {
        const { claudeRuntimeService, dispatch } = createDispatch();
        const callback = vi.fn();

        expect(dispatch.claudeRuntimeBridge.getClaudeRateLimits()).toEqual({ available: true, observedAt: 11, windows: [] });
        dispatch.claudeRuntimeBridge.onClaudeRateLimits(callback);

        expect(claudeRuntimeService.subscribe).toHaveBeenCalledWith(callback);
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

        await dispatch.dataBridge.createProject(project, ['design/active', 'design/history']);
        localGitService.commit.mockResolvedValueOnce(undefined);
        const result = await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Add defaults' });

        expect(localGitService.createProject).toHaveBeenCalledWith(project, ['design/active', 'design/history']);
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
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project, 'design/actions');
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), project);
    });

    it('opens the project sub-folder picker at the repository root', async () => {
        const openProjectSubFolder = vi.fn(async () => 'C:/repo/design/active');
        const { dispatch } = createDispatch({ openProjectSubFolder });

        await expect(dispatch.dataBridge.selectProjectSubFolder('C:/repo')).resolves.toBe('C:/repo/design/active');
        expect(openProjectSubFolder).toHaveBeenCalledWith('C:/repo');
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

    it('aborts active conflict before opening another project', async () => {
        const { dispatch, mergeConflictService, worktreeService } = createDispatch();
        mergeConflictService.getInternalSession.mockReturnValue({id: 'session-1', projectBranch: 'main', projectId: 'old', projectRoot: 'C:/old'});
        const nextProject = { branch: 'main', id: 'new', rootPath: 'C:/new' };

        await dispatch.dataBridge.loadProject(nextProject, 'design');

        expect(worktreeService.startProject).toHaveBeenNthCalledWith(1, { branch: 'main', id: 'old', rootPath: 'C:/old' });
        expect(worktreeService.abortConflict).toHaveBeenCalledWith({ sessionId: 'session-1' });
        expect(worktreeService.startProject).toHaveBeenLastCalledWith(nextProject);
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

    it('reads the project config once per activation and starts the runner before the scheduler', async () => {
        const { actionRunnerService, actionSchedulerService, dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadProject(project, 'design');

        expect(localGitService.loadProjectConfig).toHaveBeenCalledOnce();
        expect(actionRunnerService.startProject).toHaveBeenCalledWith(
            project,
            expect.objectContaining({
                actionsFolder: 'design/actions',
                activeCardsFolder: 'design/active',
                diagramsFolder: 'design/diagrams',
                projectFolder: 'design',
                releasesFolder: 'design/history',
            }),
            [{ state: 'ready' }],
        );
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project, 'design/actions');
        // A reconciled schedule can fire immediately, and firing calls into the runner.
        expect(actionRunnerService.startProject.mock.invocationCallOrder[0])
            .toBeLessThan(actionSchedulerService.startProject.mock.invocationCallOrder[0]);
    });

    it('starts the account usage refresh in the activated project folder, and only then', async () => {
        const { agentRunnerService, dispatch } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        // Creating the dispatch is the whole of app start; no project has been activated yet.
        expect(agentRunnerService.requestProjectUsageRefresh).not.toHaveBeenCalled();

        await dispatch.dataBridge.loadProject(project, 'design');

        expect(agentRunnerService.requestProjectUsageRefresh).toHaveBeenCalledOnce();
        expect(agentRunnerService.requestProjectUsageRefresh).toHaveBeenCalledWith(
            project,
            [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }],
        );
    });

    it('moves the account usage refresh to the newly activated project', async () => {
        const { agentRunnerService, dispatch } = createDispatch();
        const first = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const second = { branch: 'main', id: 'other', rootPath: 'C:/other' };

        await dispatch.dataBridge.loadProject(first, 'design');
        await dispatch.dataBridge.loadProject(second, 'design');

        expect(agentRunnerService.requestProjectUsageRefresh).toHaveBeenCalledTimes(2);
        expect(agentRunnerService.requestProjectUsageRefresh).toHaveBeenLastCalledWith(second, expect.any(Array));
    });

    it('selects a worktree folder without mutating Git', async () => {
        const openWorktreeFolder = vi.fn(async () => 'C:/feature');
        const { dispatch, worktreeService } = createDispatch({ openWorktreeFolder });

        await expect(dispatch.dataBridge.selectWorktreeFolder()).resolves.toBe('C:/feature');
        expect(worktreeService.add).not.toHaveBeenCalled();
    });

    it('returns null when worktree folder selection is cancelled', async () => {
        const openWorktreeFolder = vi.fn(async () => null);
        const { dispatch, worktreeService } = createDispatch({ openWorktreeFolder });

        await expect(dispatch.dataBridge.selectWorktreeFolder()).resolves.toBeNull();
        expect(worktreeService.add).not.toHaveBeenCalled();
    });

    it('adds a worktree at the supplied folder', async () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.addWorktree(project, 'C:/feature')).resolves.toBeUndefined();
        expect(worktreeService.add).toHaveBeenCalledWith(project, 'C:/feature');
    });

    it('delegates linked worktree removal with its folder disposition', async () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.removeWorktree(project, 'C:/feature', 'unregister')).resolves.toBeUndefined();
        expect(worktreeService.remove).toHaveBeenCalledWith(project, 'C:/feature', 'unregister');
    });

    it('rejects an unknown worktree removal mode without calling the worktree service', () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        expect(() => dispatch.dataBridge.removeWorktree(project, 'C:/feature', 'burn'))
            .toThrow('Unknown worktree removal mode: burn');
        expect(worktreeService.remove).not.toHaveBeenCalled();
    });

    it('delegates local branch deletion', async () => {
        const { dispatch, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.deleteLocalBranch(project, 'f-1-card')).resolves.toBeUndefined();
        expect(worktreeService.deleteBranch).toHaveBeenCalledWith(project, 'f-1-card');
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
        expect(worktreeService.integrate).toHaveBeenCalledWith(project, 1, { branchName: null, deleteBranch: false });
        expect(worktreeService.synchronize).not.toHaveBeenCalled();
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
        expect(worktreeService.integrate).toHaveBeenCalledWith(project, 1, {
            branchName: null,
            cardInternalId: 'stable-card-id',
            deleteBranch: false,
            projectFolder: 'design',
        });
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
        expect(worktreeService.synchronize).toHaveBeenCalledWith(project, 1);
        expect(localGitService.appendAndCommitSystemActivity.mock.invocationCallOrder[0])
            .toBeLessThan(worktreeService.synchronize.mock.invocationCallOrder[0]);
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
        expect(worktreeService.synchronize).not.toHaveBeenCalled();
    });

    it('reports linked-worktree synchronization failure after card history is tracked', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        worktreeService.synchronize.mockRejectedValueOnce(new Error('reset failed'));

        await expect(dispatch.dataBridge.integrateWorktree({
            cardInternalId: 'card-1',
            project,
            projectFolder: 'design',
            worktree: 1,
        })).rejects.toThrow('Worktree integrated and card history tracked, but linked worktree synchronization failed: reset failed');

        expect(localGitService.appendAndCommitSystemActivity).toHaveBeenCalledOnce();
        expect(worktreeService.synchronize).toHaveBeenCalledWith(project, 1);
        expect(worktreeService.park).not.toHaveBeenCalled();
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
        expect(worktreeService.synchronize).not.toHaveBeenCalled();
    });

    it('returns paused conflict without writing integration activity', async () => {
        const { dispatch, localGitService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const session = { conflictedPaths: ['src/file.js'], id: 'session-1', operation: 'integrate', phase: 'squash', repositoryRoot: 'C:/repo', worktree: 1 };
        worktreeService.integrate.mockResolvedValueOnce({ session, status: 'conflict' });

        await expect(dispatch.dataBridge.integrateWorktree({
            cardInternalId: 'card-1',
            project,
            projectFolder: 'design',
            worktree: 1,
        })).resolves.toEqual({ session, status: 'conflict' });

        expect(localGitService.appendAndCommitSystemActivity).not.toHaveBeenCalled();
    });

    it('keeps final conflict session until integration finalization succeeds', async () => {
        const { dispatch, localGitService, mergeConflictService, worktreeService } = createDispatch();
        const session = {
            id: 'session-1',
            metadata: { cardInternalId: 'card-1', deleteBranch: false, projectFolder: 'design' },
            projectBranch: 'main',
            projectId: 'local',
            projectRoot: 'C:/repo',
            worktree: 1,
        };
        worktreeService.continueConflict.mockResolvedValueOnce({ branch: 'main', commit: 'a'.repeat(40), session, status: 'completed' });
        localGitService.appendAndCommitSystemActivity.mockRejectedValueOnce(new Error('disk full'));

        await expect(dispatch.dataBridge.continueMergeConflict({ sessionId: 'session-1' }))
            .rejects.toThrow('card history tracking failed: disk full');
        expect(worktreeService.completeConflict).not.toHaveBeenCalled();

        worktreeService.continueConflict.mockResolvedValueOnce({ branch: 'main', commit: 'a'.repeat(40), session, status: 'completed' });
        await expect(dispatch.dataBridge.continueMergeConflict({ sessionId: 'session-1' }))
            .resolves.toEqual({ cardInternalId: 'card-1', status: 'completed' });
        expect(worktreeService.completeConflict).toHaveBeenCalledWith({ sessionId: 'session-1' });
        expect(mergeConflictService.updateMetadata).toHaveBeenCalledWith({ sessionId: 'session-1' }, { activityTracked: true });
    });

    it('does not duplicate tracked activity when conflict finalization is retried after synchronization fails', async () => {
        const { dispatch, localGitService, mergeConflictService, worktreeService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const initialSession = {
            id: 'session-1',
            metadata: { cardInternalId: 'card-1', deleteBranch: false, projectFolder: 'design' },
            projectBranch: project.branch,
            projectId: project.id,
            projectRoot: project.rootPath,
            worktree: 1,
        };
        const retrySession = { ...initialSession, metadata: { ...initialSession.metadata, activityTracked: true } };
        worktreeService.continueConflict
            .mockResolvedValueOnce({ branch: 'main', commit: 'a'.repeat(40), session: initialSession, status: 'completed' })
            .mockResolvedValueOnce({ branch: 'main', commit: 'a'.repeat(40), session: retrySession, status: 'completed' });
        mergeConflictService.updateMetadata.mockImplementation((_request, updates) => ({ ...initialSession.metadata, ...updates }));
        worktreeService.synchronizeConflict.mockRejectedValueOnce(new Error('locked'));

        await expect(dispatch.dataBridge.continueMergeConflict({ sessionId: 'session-1' }))
            .rejects.toThrow('linked worktree synchronization failed: locked');
        await expect(dispatch.dataBridge.continueMergeConflict({ sessionId: 'session-1' }))
            .resolves.toEqual({ cardInternalId: 'card-1', status: 'completed' });

        expect(localGitService.appendAndCommitSystemActivity).toHaveBeenCalledOnce();
        expect(worktreeService.synchronizeConflict).toHaveBeenCalledTimes(2);
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
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project, 'design/actions');
    });

    it('delegates safe action start requests to the shared runner', async () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = {
            actionId: 'test', context: { file: 'design/F-1.md', kind: 'card' },
            runInput: { extraPrompt: 'focus', permissionMode: 'approve-for-me' },
        };

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
        await dispatch.actionBridge.enqueueActionPrompt('action-1', 'next');
        await dispatch.actionBridge.editActionQueuedPrompt('action-1', 'prompt-1', 0, 'edited');
        await dispatch.actionBridge.deleteActionQueuedPrompt('action-1', 'prompt-1', 1);
        await dispatch.actionBridge.answerActionApproval('action-1', 41, 'accept');
        await dispatch.actionBridge.answerActionQuestion('action-1', 7, { confirm: ['Yes'] });
        await dispatch.actionBridge.dismissActionQuestions('action-1', 7);
        await dispatch.actionBridge.finishActionRun('action-1');

        expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1');
        expect(actionRunnerService.sendAgentMessage).toHaveBeenCalledWith('action-1', 'approved');
        expect(actionRunnerService.enqueueAgentPrompt).toHaveBeenCalledWith('action-1', 'next');
        expect(actionRunnerService.editQueuedAgentPrompt).toHaveBeenCalledWith('action-1', 'prompt-1', 0, 'edited');
        expect(actionRunnerService.deleteQueuedAgentPrompt).toHaveBeenCalledWith('action-1', 'prompt-1', 1);
        expect(actionRunnerService.answerAgentApproval).toHaveBeenCalledWith('action-1', 41, 'accept');
        expect(actionRunnerService.answerAgentQuestion).toHaveBeenCalledWith('action-1', 7, { confirm: ['Yes'] });
        expect(actionRunnerService.dismissAgentQuestions).toHaveBeenCalledWith('action-1', 7);
        expect(actionRunnerService.finishAgentRun).toHaveBeenCalledWith('action-1');
    });

    it('delegates persisted waiting conversation closure through current project', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const reference = 'design/activity/project.json#conversation=conversation-1';
        await dispatch.dataBridge.loadProject(project, 'design');

        await expect(dispatch.actionBridge.closeWaitingActionConversation(reference, 'cancelled'))
            .resolves.toEqual({ path: reference, status: 'cancelled' });
        expect(localGitService.closeWaitingActivityConversation).toHaveBeenCalledWith(project, reference, 'cancelled');
    });

    it('delegates targeted conversation view updates through current project', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const reference = 'design/activity/card__card-1.json#conversation=conversation-1';
        await dispatch.dataBridge.loadProject(project, 'design');

        await expect(dispatch.actionBridge.updateActionConversationViewed(reference, false))
            .resolves.toEqual({ path: reference, viewed: false });
        expect(localGitService.updateActivityConversationViewed).toHaveBeenCalledWith(project, reference, false);
    });

    it('delegates atomic action restart with old run and new request', async () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const request = { actionId: 'test', context: { kind: 'project' }, runInput: { continueFrom: 'conversation.json' } };

        await expect(dispatch.actionBridge.restartActionRun('action-1', request)).resolves.toBe('action-2');
        expect(actionRunnerService.restart).toHaveBeenCalledWith('action-1', request);
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

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({
            activityOrigin: { kind: 'project' },
            command: ['codex', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '--search', 'exec', '--json'],
            prompt: expect.stringContaining('find beta cards'),
        }), expect.any(Function));
    });

    it('invokes shared method table for remote control', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.invoke('loadProjectRoot', [project, 'design']);

        expect(localGitService.loadProjectRoot).toHaveBeenCalledWith(project, 'design');
    });

    it('forwards project root exclusion through the shared method table', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.invoke('loadProject', [project, 'design', 'design/active']);

        expect(localGitService.loadProject).toHaveBeenCalledWith(project, 'design', 'design/active');
    });

    it('forwards single file reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadFile(project, 'design/F-1.md');

        expect(localGitService.loadFile).toHaveBeenCalledWith(project, 'design/F-1.md');
    });

    it('forwards repository text file reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadTextFile(project, 'design/activity/card__card-1.json');

        expect(localGitService.loadTextFile).toHaveBeenCalledWith(project, 'design/activity/card__card-1.json');
    });

    it('runs and cancels stats calculations through worker service for active project', async () => {
        const { dispatch, projectStatsWorkerService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        await dispatch.dataBridge.loadProjectRoot(project, 'design');

        await dispatch.dataBridge.calculateActivityStats(project, ['design/activity/project.json'], 'stats-1');
        await dispatch.dataBridge.cancelActivityStatsCalculation('stats-1');

        expect(projectStatsWorkerService.calculate).toHaveBeenCalledWith(
            project.rootPath,
            ['design/activity/project.json'],
            'stats-1',
        );
        expect(projectStatsWorkerService.cancel).toHaveBeenCalledWith('stats-1');
    });

    it('forwards agent conversation reference listing through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await expect(dispatch.dataBridge.listAgentConversationReferences(project, 'design')).resolves.toEqual([
            'design/activity/project.json#conversation=conversation-1',
        ]);
        expect(localGitService.listAgentConversationReferences).toHaveBeenCalledWith(project, 'design');
    });

    it('forwards activity-file conversation loading through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const path = 'design/activity/card__card-1.json';

        await expect(dispatch.dataBridge.loadActivityConversations(path)).resolves.toEqual([]);
        expect(localGitService.loadActivityConversations).toHaveBeenCalledWith(null, path);
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

    it('loads authoritative action run recovery through the action bridge', () => {
        const { actionRunnerService, dispatch } = createDispatch();

        const snapshot = dispatch.actionBridge.loadActionRunRecoverySnapshot(['run-ended']);

        expect(snapshot).toEqual({
            activeRunEvents: [{ runId: 'run-1', sequence: 1 }],
            terminalResults: [{ failure: null, runId: 'run-ended', status: 'completed' }],
        });
        expect(actionRunnerService.loadRunRecoverySnapshot).toHaveBeenCalledWith(['run-ended']);
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

    it('updates complete card action settings through the primary checkout', async () => {
        const { actionRunnerService, dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = {
            actionId: 'review',
            cardInternalId: 'card-1',
            settings: { agent: 'codex', model: 'gpt-5', permissionMode: 'ask-for-approval', thinkingLevel: 'high' },
        };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.updateCardActionSettings(request);

        expect(actionRunnerService.requireProjectFolder).toHaveBeenCalled();
        expect(localGitService.updateCardActionSettings).toHaveBeenCalledWith(
            project,
            'design',
            request.cardInternalId,
            request.actionId,
            request.settings,
        );
    });

});
