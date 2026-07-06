import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(currentDirectory, 'preload.js')
const actualConfig = require('./config')
const actualLocalBridgeDispatch = require('./local_bridge_dispatch')

function createPreloadHarness() {
    const storeData = {}
    const localGitService = new Proxy({
        continueAgentConversation: vi.fn(() => ({ reference: 'continued-log.json' })),
    }, {
        get: (target, property) => target[property] ?? vi.fn(),
    })
    const agentRunnerService = {
        sendInput: vi.fn(),
        start: vi.fn(() => ({ reference: 'started-log.json' })),
        stop: vi.fn(),
        stopAll: vi.fn(),
    }
    const actionSchedulerService = {
        stop: vi.fn(),
    }
    const window = { addEventListener: vi.fn() }
    const electron = { ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() } }

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

    return { actionSchedulerService, agentRunnerService, localGitService, window }
}

describe('preload desktop agent bridge', () => {
    it('continues an agent conversation with the stored desktop agent instead of MD2_AGENT', () => {
        const previousAgent = process.env.MD2_AGENT
        process.env.MD2_AGENT = 'env-agent'

        try {
            const { localGitService, window } = createPreloadHarness()

            window.md2Config.setDesktopConfig({ agent: 'stored-agent' })
            window.md2Data.continueAgentConversation({ input: 'continue this' })

            expect(localGitService.continueAgentConversation).toHaveBeenCalledWith(null, {
                command: 'stored-agent',
                input: 'continue this',
            })
        } finally {
            if (previousAgent === undefined) {
                delete process.env.MD2_AGENT
            } else {
                process.env.MD2_AGENT = previousAgent
            }
        }
    })

    it('starts an agent conversation with the stored desktop agent instead of MD2_AGENT', () => {
        const previousAgent = process.env.MD2_AGENT
        process.env.MD2_AGENT = 'env-agent'

        try {
            const { agentRunnerService, window } = createPreloadHarness()
            const callback = vi.fn()

            window.md2Config.setDesktopConfig({ agent: 'stored-agent' })
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
