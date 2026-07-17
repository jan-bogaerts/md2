import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch');

function createDispatch(options = {}) {
    const agentExecutableAvailability = vi.fn(async () => ({ codex: { available: true, error: null } }));
    const actionRunnerService = {
        cancel: vi.fn(),
        requireActionsFolder: vi.fn(() => 'actions'),
        requireProjectFolder: vi.fn(() => 'design'),
        start: vi.fn(async () => 'action-1'),
        subscribe: vi.fn(() => vi.fn()),
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
    const localGitService = {
        assertGitRoot: vi.fn(),
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        hasPendingPush: vi.fn(async () => false),
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
        loadProjectAsset: vi.fn(async () => ({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' })),
        loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        resolveLocalProject: vi.fn(async () => ({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })),
        runCommand: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: 'ok' })),
        watchProject: vi.fn(() => vi.fn()),
    };
    const actionWorktreeExecutionService = {
        execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
            ...await runner(primaryProject),
            branch: primaryProject.branch,
            repositoryRoot: primaryProject.rootPath,
        })),
        resolve: vi.fn(async (primaryProject) => ({ executionProject: primaryProject, transferRecord: null })),
    };
    const desktopConfig = options.desktopConfig ?? {agent: 'codex', agentProfiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }], model: 'gpt-5'};
    const dispatch = createLocalBridgeDispatch({
        actionRunnerService,
        actionSchedulerService,
        actionWorktreeExecutionService,
        agentExecutableAvailability,
        agentRunnerService,
        desktopConfigStore: {},
        diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
        localGitService,
        openProjectFolder: options.openProjectFolder,
        readDesktopConfig: () => desktopConfig,
        worktreeService: { resolvePath: vi.fn() },
    });

    return { actionRunnerService, actionSchedulerService, agentExecutableAvailability, agentRunnerService, dispatch, localGitService };
}

describe('createLocalBridgeDispatch', () => {
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

    it('delegates cancellation and live input by execution id', async () => {
        const { actionRunnerService, dispatch } = createDispatch();

        await dispatch.actionBridge.cancelActionExecution('action-1');

        expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1');
    });

    it('owns search-agent command and prompt construction in Electron', async () => {
        const { agentRunnerService, dispatch } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.runSearchRegexpAgent('find beta cards', vi.fn());

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({cardPath: '.md2-search-regexp', command: ['codex', '--search', 'exec', '--json'], prompt: expect.stringContaining('find beta cards')}), expect.any(Function));
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

    it('forwards project asset reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        await dispatch.dataBridge.loadProjectAsset(project, 'actions/icon.png');

        expect(localGitService.loadProjectAsset).toHaveBeenCalledWith(project, 'actions/icon.png');
    });

    it('exposes shared action execution subscriptions through the action bridge', () => {
        const { actionRunnerService, dispatch } = createDispatch();
        const callback = vi.fn();

        dispatch.actionBridge.onActionExecution(callback);

        expect(actionRunnerService.subscribe).toHaveBeenCalledWith(callback);
    });

    it('loads history with the runner-owned actions folder and shared definition resolver', async () => {
        const { actionRunnerService, dispatch, localGitService } = createDispatch();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const request = { actionId: 'test', context: { file: 'design/F-1.md', kind: 'card' } };
        await dispatch.dataBridge.loadProject(project, 'design');

        await dispatch.actionBridge.loadActionRunHistory(request);

        expect(actionRunnerService.requireActionsFolder).toHaveBeenCalled();
        expect(actionRunnerService.requireProjectFolder).toHaveBeenCalled();
        expect(localGitService.loadActionRunHistory).toHaveBeenCalledWith(project, { ...request, projectFolder: 'design' });
    });

});
