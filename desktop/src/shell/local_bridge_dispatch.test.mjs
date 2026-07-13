import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')

function createDispatch(options = {}) {
    const agentExecutableAvailability = vi.fn(async () => ({ codex: { available: true, error: null } }))
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
        loadActionFiles: vi.fn(async () => options.actionFiles ?? [{
            content: JSON.stringify({
                command: 'npm test {{file}} {{prompt}}',
                description: 'Run tests',
                id: 'test',
                label: 'Test',
                name: 'test',
                type: 'command',
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
    const desktopConfig = options.desktopConfig ?? {
        agent: 'codex', agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }], model: 'gpt-5',
    }
    const dispatch = createLocalBridgeDispatch({
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
    })

    return { actionSchedulerService, agentExecutableAvailability, agentRunnerService, dispatch, localGitService }
}

describe('createLocalBridgeDispatch', () => {
    it('loads executable availability from configured profiles', async () => {
        const { agentExecutableAvailability, dispatch } = createDispatch()

        await expect(dispatch.dataBridge.loadAgentAvailability()).resolves.toEqual({ codex: { available: true, error: null } })
        expect(agentExecutableAvailability).toHaveBeenCalledWith([{ command: 'codex', models: ['gpt-5'], name: 'codex' }])
    })

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
            actionId: 'test',
            actionsFolder: 'actions',
            context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: 'focus',
        })

        expect(localGitService.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(localGitService.commit).toHaveBeenCalledWith({ branch: 'main', files: [], message: 'Update' }, project)
        expect(localGitService.loadActionFiles).toHaveBeenCalledWith(project, 'actions')
        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'npm test design/F-1.md focus')
    })

    it('rejects unknown command action ids', async () => {
        const { dispatch } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await expect(dispatch.actionBridge.runCommand({
            actionId: 'missing',
            actionsFolder: 'actions',
            context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: '',
        })).rejects.toThrow('Unknown action: missing')
    })

    it('resolves persisted agent prompts inside Electron from an id-only action request', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                description: 'Review files', id: 'review', label: 'Review', name: 'review',
                prompt: 'Review {{file}}', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')

        await dispatch.actionBridge.runAgent({
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: 'Focus tests',
        }, vi.fn())

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({
            agent: 'codex', cardPath: 'design/F-1.md', command: 'codex', model: 'gpt-5',
            prompt: 'Review design/F-1.md\n\nFocus tests', thinkingLevel: 'none', title: 'Review',
        }), expect.any(Function))
    })

    it('resolves thinking level from runtime input before action definition and config', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                agent: 'codex', description: 'Review files', id: 'review', label: 'Review', model: 'gpt-5', name: 'review',
                prompt: 'Review {{file}}', thinkingLevel: 'high', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const desktopConfig = {
            agent: 'codex', agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
            model: 'gpt-5', thinkingLevel: 'medium',
        }
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles, desktopConfig })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')

        const result = await dispatch.actionBridge.runAgent({
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' },
            extraInput: '', thinkingLevel: 'low',
        }, vi.fn())

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({
            command: 'codex -c model_reasoning_effort=low', thinkingLevel: 'low',
        }), expect.any(Function))
        expect(result).toMatchObject({ agent: 'codex', model: 'gpt-5', thinkingLevel: 'low' })
    })

    it('uses definition then config thinking levels and lets none omit the override', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                agent: 'codex', description: 'Review files', id: 'review', label: 'Review', model: 'gpt-5', name: 'review',
                prompt: 'Review {{file}}', thinkingLevel: 'high', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const desktopConfig = {
            agent: 'codex', agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
            model: 'gpt-5', thinkingLevel: 'medium',
        }
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles, desktopConfig })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')
        const request = {
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' }, extraInput: '',
        }

        await dispatch.actionBridge.runAgent(request, vi.fn())
        await dispatch.actionBridge.runAgent({ ...request, thinkingLevel: 'none' }, vi.fn())

        expect(agentRunnerService.run).toHaveBeenNthCalledWith(1, project, expect.objectContaining({
            command: 'codex -c model_reasoning_effort=high', thinkingLevel: 'high',
        }), expect.any(Function))
        expect(agentRunnerService.run).toHaveBeenNthCalledWith(2, project, expect.objectContaining({
            command: 'codex', thinkingLevel: 'none',
        }), expect.any(Function))
    })

    it('uses configured thinking level when runtime and definition omit it', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                description: 'Review files', id: 'review', label: 'Review', name: 'review', prompt: 'Review {{file}}', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const desktopConfig = {
            agent: 'codex', agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
            model: 'gpt-5', thinkingLevel: 'medium',
        }
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles, desktopConfig })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')

        await dispatch.actionBridge.runAgent({
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' }, extraInput: '',
        }, vi.fn())

        expect(agentRunnerService.run).toHaveBeenCalledWith(project, expect.objectContaining({
            command: 'codex -c model_reasoning_effort=medium', thinkingLevel: 'medium',
        }), expect.any(Function))
    })

    it('rejects invalid and unsupported thinking levels before agent process start', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                agent: 'custom', description: 'Review files', id: 'review', label: 'Review', model: 'fast', name: 'review',
                prompt: 'Review {{file}}', thinkingLevel: 'high', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const desktopConfig = {
            agent: 'custom', agentProfiles: [{ command: 'custom-agent', models: ['fast'], name: 'custom' }], model: 'fast',
        }
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles, desktopConfig })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')
        const request = {
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' }, extraInput: '',
        }

        await expect(dispatch.actionBridge.runAgent({ ...request, thinkingLevel: 'extreme' }, vi.fn())).rejects.toThrow('Invalid thinking level')
        await expect(dispatch.actionBridge.runAgent(request, vi.fn())).rejects.toThrow('Agent profile does not support thinking levels: custom')
        expect(agentRunnerService.run).not.toHaveBeenCalled()
    })

    it('rejects an invalid persisted thinking level before agent process start', async () => {
        const actionFiles = [{
            content: JSON.stringify({
                agent: 'codex', description: 'Review files', id: 'review', label: 'Review', model: 'gpt-5', name: 'review',
                prompt: 'Review {{file}}', thinkingLevel: 'extreme', type: 'agent',
            }),
            path: 'actions/review.json',
        }]
        const { agentRunnerService, dispatch } = createDispatch({ actionFiles })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        await dispatch.dataBridge.loadProject(project, 'design')

        await expect(dispatch.actionBridge.runAgent({
            actionId: 'review', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' }, extraInput: '',
        }, vi.fn())).rejects.toThrow('Invalid thinking level')
        expect(agentRunnerService.run).not.toHaveBeenCalled()
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
