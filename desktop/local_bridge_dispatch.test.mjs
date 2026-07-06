import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')

function createDispatch() {
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
        continueAgentConversation: vi.fn(async () => ({ reference: 'log.json' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        runCommand: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: 'ok' })),
        watchProject: vi.fn(() => vi.fn()),
    }
    const dispatch = createLocalBridgeDispatch({
        actionSchedulerService,
        agentRunnerService,
        desktopConfigStore: {},
        diffService: { generateDiff: vi.fn(), openInEditor: vi.fn() },
        localGitService,
        readDesktopConfig: () => ({ agent: 'codex' }),
    })

    return { actionSchedulerService, agentRunnerService, dispatch, localGitService }
}

describe('createLocalBridgeDispatch', () => {
    it('keeps loaded project state for data and action methods', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.dataBridge.loadProject(project, 'design')
        await dispatch.dataBridge.commit({ branch: 'main', files: [], message: 'Update' })
        await dispatch.actionBridge.runCommand('npm test')

        expect(localGitService.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(localGitService.commit).toHaveBeenCalledWith({ branch: 'main', files: [], message: 'Update' }, project)
        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'npm test')
    })

    it('invokes shared method table for remote control', async () => {
        const { dispatch, localGitService } = createDispatch()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await dispatch.invoke('loadProjectRoot', [project, 'design'])

        expect(localGitService.loadProjectRoot).toHaveBeenCalledWith(project, 'design')
    })

    it('exposes scheduled run subscriptions through the action bridge', () => {
        const { actionSchedulerService, dispatch } = createDispatch()
        const callback = vi.fn()

        dispatch.actionBridge.onScheduledActionRun(callback)

        expect(actionSchedulerService.subscribeRunEvents).toHaveBeenCalledWith(callback)
    })
})
