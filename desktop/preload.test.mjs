import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const mainPath = join(currentDirectory, 'main.js')
const preloadPath = join(currentDirectory, 'preload.js')
const actualConfig = require('./config')
const actualAgentProfiles = require('./agent_profiles')
const actualLocalBridgeDispatch = require('./local_bridge_dispatch')

function createPreloadHarness() {
    const storeData = {}
    const localGitService = new Proxy({}, {
        get: (target, property) => target[property] ?? vi.fn(),
    })
    const agentRunnerService = {
        sendInput: vi.fn(),
        start: vi.fn(() => ({ reference: 'started-log.json' })),
        stop: vi.fn(),
        stopAll: vi.fn(),
    }
    const actionSchedulerService = {
        startProject: vi.fn(),
        stop: vi.fn(),
    }
    const window = { addEventListener: vi.fn() }
    const exposed = {}
    const contextBridge = {
        exposeInMainWorld: vi.fn((name, bridge) => {
            exposed[name] = bridge
            window[name] = bridge
        }),
    }
    const electron = {
        contextBridge,
        ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    }

    class FakeStore {
        get(key) {
            return storeData[key]
        }

        set(key, value) {
            storeData[key] = value
        }
    }

    class FakeAgentRunnerService {
        constructor() {
            return agentRunnerService
        }
    }

    class FakeActionSchedulerService {
        constructor() {
            return actionSchedulerService
        }
    }

    const mockedModules = {
        './action_scheduler_service': { ActionSchedulerService: FakeActionSchedulerService },
        './agent_profiles': actualAgentProfiles,
        './agent_runner_service': { AgentRunnerService: FakeAgentRunnerService },
        './config': actualConfig,
        './diff_service': {},
        './github_oauth_proxy': { requestGithubAccessToken: vi.fn(), requestGithubDeviceCode: vi.fn() },
        './local_bridge_dispatch': actualLocalBridgeDispatch,
        './local_git_service': localGitService,
        electron,
        'electron-store': FakeStore,
    }
    const fakeRequire = (moduleName) => mockedModules[moduleName]
    const module = { exports: {} }
    const context = vm.createContext({
        module,
        exports: module.exports,
        require: fakeRequire,
        window,
    })
    const script = new vm.Script(readFileSync(preloadPath, 'utf8'), { filename: preloadPath })

    script.runInContext(context)

    return { actionSchedulerService, agentRunnerService, electron, exposed, localGitService, window }
}

describe('preload desktop agent bridge', () => {
    it('exposes only the named desktop bridges through contextBridge', () => {
        const { electron, exposed, window } = createPreloadHarness()

        expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(8)
        expect(Object.keys(exposed).sort()).toEqual([
            'md2Actions',
            'md2Config',
            'md2Data',
            'md2GithubAuth',
            'md2Lifecycle',
            'md2Remarkable',
            'md2RemoteControl',
            'md2Theme',
        ])
        expect(window.require).toBeUndefined()
        expect(exposed.md2Data.openProjectFolder).toEqual(expect.any(Function))
        expect(exposed.md2Actions.runCommand).toEqual(expect.any(Function))
        expect(exposed.md2Lifecycle.onFlushRequested).toEqual(expect.any(Function))
        expect(exposed.md2RemoteControl.onStatusChange).toEqual(expect.any(Function))
    })

    it('wraps remote-control callbacks without exposing ipcRenderer', () => {
        const { electron, exposed } = createPreloadHarness()
        const callback = vi.fn()
        const unsubscribe = exposed.md2RemoteControl.onStatusChange(callback)
        const listener = electron.ipcRenderer.on.mock.calls[0][1]

        listener({ sender: 'internal' }, { endpoint: 'ws://localhost:3555', running: true })
        unsubscribe()

        expect(electron.ipcRenderer.on).toHaveBeenCalledWith('md2-remote-control:status', expect.any(Function))
        expect(callback).toHaveBeenCalledWith({ endpoint: 'ws://localhost:3555', running: true })
        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith('md2-remote-control:status', listener)
        expect(exposed.md2RemoteControl.ipcRenderer).toBeUndefined()
    })

    it('wraps lifecycle flush requests and confirmations without exposing ipcRenderer', () => {
        const { electron, exposed } = createPreloadHarness()
        const callback = vi.fn()
        const unsubscribe = exposed.md2Lifecycle.onFlushRequested(callback)
        const listener = electron.ipcRenderer.on.mock.calls[0][1]

        listener({ sender: 'internal' }, 'quit-1')
        exposed.md2Lifecycle.confirmFlush('quit-1')
        unsubscribe()

        expect(electron.ipcRenderer.on).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits', expect.any(Function))
        expect(callback).toHaveBeenCalledWith('quit-1')
        expect(electron.ipcRenderer.send).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits-done', 'quit-1')
        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith('md2-lifecycle:flush-pending-commits', listener)
        expect(exposed.md2Lifecycle.ipcRenderer).toBeUndefined()
    })

    it('starts an agent conversation with the selected stored profile when MD2_AGENT overrides only codex', () => {
        const previousAgent = process.env.MD2_AGENT
        process.env.MD2_AGENT = 'env-agent'

        try {
            const { agentRunnerService, window } = createPreloadHarness()
            const callback = vi.fn()

            window.md2Config.setDesktopConfig({
                agent: 'stored-agent',
                agentProfiles: [{ command: 'stored-agent', name: 'stored-agent' }],
                model: '',
            })
            window.md2Data.startAgentConversation({ prompt: 'start this' }, callback)

            expect(agentRunnerService.start).toHaveBeenCalledWith(null, {
                command: 'stored-agent',
                prompt: 'start this',
            }, callback)
        } finally {
            if (previousAgent === undefined) {
                delete process.env.MD2_AGENT
            } else {
                process.env.MD2_AGENT = previousAgent
            }
        }
    })
})

describe('electron main isolation settings', () => {
    it('creates renderer windows with context isolation and without Node integration', () => {
        const source = readFileSync(mainPath, 'utf8')

        expect(source).toContain('nodeIntegration: false')
        expect(source).toContain('contextIsolation: true')
        expect(source).toContain('sandbox: false')
    })

    it('waits for renderer pending commit flush before quitting', () => {
        const source = readFileSync(mainPath, 'utf8')

        expect(source).toContain("const LIFECYCLE_FLUSH_REQUEST_CHANNEL = 'md2-lifecycle:flush-pending-commits'")
        expect(source).toContain('const QUIT_FLUSH_TIMEOUT_MS = 5000')
        expect(source).toContain('await flushRendererPendingCommits()')
        expect(source.indexOf('await flushRendererPendingCommits()')).toBeLessThan(source.indexOf('await remoteControlService.stop()'))
    })
})
