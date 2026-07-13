import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')

function createDispatch(options = {}) {
    const actionSchedulerService = {
        handleActionCompleted: vi.fn(),
        registerActionSchedule: vi.fn(async () => ({ id: 'schedule-1' })),
        startProject: vi.fn(),
        subscribeRunEvents: vi.fn(() => vi.fn()),
    }
    const agentRunnerService = {
        run: vi.fn(async () => ({ runId: 'run-1' })),
        sendInput: vi.fn(),
        start: vi.fn(async () => ({ runId: 'run-2' })),
        stop: vi.fn(),
    }
    const localGitService = {
        assertGitRoot: vi.fn(),
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        hasPendingPush: vi.fn(async () => false),
        loadFile: vi.fn(async () => ({ content: '# Root', path: 'design/F-1.md' })),
        loadActionFiles: vi.fn(async () => [{
            content: JSON.stringify({
                description: 'Run tests',
                label: 'Test',
                name: 'test',
                text: 'npm test {{file}} {{prompt}}',
                type: 'cmd',
            }),
            path: 'actions/test.json',
        }]),
        loadProjectAsset: vi.fn(async () => ({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        resolveLocalProject: vi.fn(async () => ({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })),
        runCommand: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: 'ok' })),
        watchProject: vi.fn(() => vi.fn()),
    }
    const actionWorktreeExecutionService = {
        execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
            ...await runner(primaryProject),
            branch: primaryProject.branch,
            repositoryRoot: primaryProject.rootPath,
        })),
        resolve: vi.fn(async (primaryProject) => ({ executionProject: primaryProject, transferRecord: null })),
    }
    const dispatch = createLocalBridgeDispatch({
        actionSchedulerService,
        actionWorktreeExecutionService,
        agentRunnerService,
        desktopConfigStore: {},
        diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
        localGitService,
        openProjectFolder: options.openProjectFolder,
        readDesktopConfig: () => ({ agent: 'codex', agentProfiles: [{ command: 'codex', name: 'codex' }], model: '' }),
        worktreeService: { resolvePath: vi.fn() },
    })

    return { actionSchedulerService, agentRunnerService, dispatch, localGitService }
}

describe('createLocalBridgeDispatch', () => {
    it('forwards pending push checks to the local Git service', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await expect(dispatch.dataBridge.hasPendingPush(project)).resolves.toBe(false)
        expect(localGitService.hasPendingPush).toHaveBeenCalledWith(project)
    })

    it('opens a selected folder as a normalized project and establishes it for project operations', async () => {
        const openProjectFolder = vi.fn(async () => 'C:/repo/nested')
        const { actionSchedulerService, dispatch, localGitService } = createDispatch({ openProjectFolder })

        const project = await dispatch.dataBridge.openProjectFolder()
        await dispatch.dataBridge.commit({ branch: 'topic', files: [], message: 'Update' })

        expect(localGitService.resolveLocalProject).toHaveBeenCalledWith('C:/repo/nested')
        expect(project).toEqual({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project)
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), project)
    })

    it('leaves the current project unchanged when folder selection is cancelled', async () => {
        const { dispatch, localGitService } = createDispatch({ openProjectFolder: vi.fn(async () => null) })
        const currentProject = { branch: 'main', id: 'current', rootPath: 'C:/current' }
        await dispatch.dataBridge.loadProject(currentProject, 'design')

        await expect(dispatch.dataBridge.openProjectFolder()).resolves.toBeNull()
        await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Update' })

        expect(localGitService.resolveLocalProject).not.toHaveBeenCalled()
        expect(localGitService.commit).toHaveBeenCalledWith(expect.any(Object), currentProject)
    })

    it('revalidates and normalizes a stored local project', async () => {
        const { actionSchedulerService, dispatch, localGitService } = createDispatch()
        const storedProject = { branch: 'main', id: 'C:/repo/nested', rootPath: 'C:/repo/nested' }

        const project = await dispatch.dataBridge.resolveProject(storedProject)

        expect(localGitService.resolveLocalProject).toHaveBeenCalledWith(storedProject.rootPath)
        expect(project).toEqual({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        expect(actionSchedulerService.startProject).toHaveBeenCalledWith(project)
    })

    it('keeps loaded project state for data and action methods', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Update' })
        await dispatch.actionBridge.runCommand({
            actionName: 'test',
            actionsFolder: 'actions',
            context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: 'focus',
        })

        expect(localGitService.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(localGitService.commit).toHaveBeenCalledWith({ branch: 'main', files: [], message: 'Update' }, project)
        expect(localGitService.loadActionFiles).toHaveBeenCalledWith(project, 'actions')
        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'npm test design/F-1.md focus')
    })

    it('rejects unknown command action names', async () => {
        const { dispatch } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await expect(dispatch.actionBridge.runCommand({
            actionName: 'missing',
            actionsFolder: 'actions',
            context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: '',
        })).rejects.toThrow('Unknown action: missing')
    })

    it('invokes shared method table for remote control', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.invoke('loadProjectRoot', [project, 'design'])

        expect(localGitService.loadProjectRoot).toHaveBeenCalledWith(project, 'design')
    })

    it('forwards single file reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadFile(project, 'design/F-1.md')

        expect(localGitService.loadFile).toHaveBeenCalledWith(project, 'design/F-1.md')
    })

    it('forwards project asset reads through the data bridge', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProjectAsset(project, 'actions/icon.png')

        expect(localGitService.loadProjectAsset).toHaveBeenCalledWith(project, 'actions/icon.png')
    })

    it('exposes scheduled run subscriptions through the action bridge', () => {
        const { actionSchedulerService, dispatch } = createDispatch()
        const callback = vi.fn()

        dispatch.actionBridge.onScheduledActionRun(callback)

        expect(actionSchedulerService.subscribeRunEvents).toHaveBeenCalledWith(callback)
    })

    it('uses profile resume command for native agent resume starts', async () => {
        const agentRunnerService = {
            run: vi.fn(async () => ({ runId: 'run-1' })),
            sendInput: vi.fn(),
            start: vi.fn(async () => ({ runId: 'run-2' })),
            stop: vi.fn(),
        }
        const dispatch = createLocalBridgeDispatch({
            actionSchedulerService: null,
            agentRunnerService,
            desktopConfigStore: {},
            diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
            localGitService: {
                assertGitRoot: vi.fn(),
                loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            },
            readDesktopConfig: () => ({
                agent: 'resumable',
                agentProfiles: [{
                    command: 'agent start',
                    name: 'resumable',
                    resumeCommand: 'agent resume {{sessionId}}',
                    sessionIdPattern: 'Session: (.+)',
                }],
                model: '',
            }),
        })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await dispatch.dataBridge.startAgentConversation({ cardPath: 'design/F-1.md', nativeResumeSessionId: 'session-1', prompt: 'continue' }, vi.fn())

        expect(agentRunnerService.start).toHaveBeenCalledWith(project, {
            cardPath: 'design/F-1.md',
            command: 'agent resume session-1',
            nativeResumeSessionId: 'session-1',
            prompt: 'continue',
            sessionIdPattern: 'Session: (.+)',
        }, expect.any(Function))
    })

    it('uses transcript replay command when no native session id is present', async () => {
        const agentRunnerService = {
            run: vi.fn(async () => ({ runId: 'run-1' })),
            sendInput: vi.fn(),
            start: vi.fn(async () => ({ runId: 'run-2' })),
            stop: vi.fn(),
        }
        const dispatch = createLocalBridgeDispatch({
            actionSchedulerService: null,
            agentRunnerService,
            desktopConfigStore: {},
            diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
            localGitService: {
                assertGitRoot: vi.fn(),
                loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            },
            readDesktopConfig: () => ({
                agent: 'resumable',
                agentProfiles: [{
                    command: 'agent start',
                    name: 'resumable',
                    resumeCommand: 'agent resume {{sessionId}}',
                    sessionIdPattern: 'Session: (.+)',
                }],
                model: '',
            }),
        })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await dispatch.dataBridge.startAgentConversation({ cardPath: 'design/F-1.md', prompt: 'transcript replay' }, vi.fn())

        expect(agentRunnerService.start).toHaveBeenCalledWith(project, {
            cardPath: 'design/F-1.md',
            command: 'agent start',
            prompt: 'transcript replay',
            sessionIdPattern: 'Session: (.+)',
        }, expect.any(Function))
    })
})
