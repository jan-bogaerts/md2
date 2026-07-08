import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import type { AgentExecutionRequest, ElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation } from '../../data/data_types'
import { configService } from '../../services/config_service'
import * as searchRegexpAgent from '../../services/search/search_regexp_agent'
import { MainWindow } from './main_window'

const auth: UseGithubAuthResult = {
    accessToken: null,
    authMethod: null,
    deviceCode: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    login: vi.fn(),
    logout: vi.fn(),
    savePersonalAccessToken: vi.fn(),
    status: 'idle',
    user: null,
}

function renderWindow(overrides?: Partial<Parameters<typeof MainWindow>[0]>) {
    return render(
        <MainWindow
            agents={[]}
            auth={auth}
            bootstrapError={null}
            session={null}
            toolbarAction={<button type="button">Action</button>}
            {...overrides}
        />,
    )
}

function conversation(request: AgentExecutionRequest): AgentConversation {
    return {
        cardPath: request.cardPath,
        completedAt: '2026-01-01T00:01:00.000Z',
        continuedFrom: null,
        events: [],
        id: 'agent-1',
        messages: [{ content: request.prompt, id: 'm1', role: 'stdout', timestamp: '2026-01-01T00:01:00.000Z' }],
        nativeSessionId: null,
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Search RegExp',
    }
}

function installAgentBridge(stdout: string) {
    const bridge: ElectronActionBridge = {
        appendActionRunHistory: vi.fn(async () => []),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        openInEditor: vi.fn(async () => {}),
        runAgent: vi.fn(async (request: AgentExecutionRequest) => ({
            command: request.command,
            conversation: conversation(request),
            exitCode: 0,
            prompt: request.prompt,
            reference: '.md2-agent-logs/one.json',
            runId: 'agent-1',
            stderr: '',
            stdout,
        })),
        runCommand: vi.fn(async () => ({ command: '', exitCode: 0, stderr: '', stdout: '' })),
    }
    window.md2Actions = bridge

    return bridge
}

function typeQuery(value: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project' }), { target: { value } })
}

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

describe('MainWindow', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        delete window.md2Actions
        window.history.pushState(null, '', '/')
        mockMatchMedia(false)
    })

    it('shows both panels and the status bar on desktop', () => {
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Project' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'No project open' })).toBeInTheDocument()
        expect(screen.getByText('No project navigation available.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('moves the left panel content into a hamburger drawer on mobile', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        expect(screen.getByText('No project navigation available.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()
    })

    it('keeps GitHub authentication reachable from the toolbar', () => {
        mockMatchMedia(true)
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'GitHub account' }))

        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    })

    it('opens the config page from the toolbar', () => {
        mockMatchMedia(false)
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'Open config' }))

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(window.location.pathname).toBe('/config')
    })

    it('opens the config page directly from the URL', () => {
        window.history.pushState(null, '', '/config#connection')
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Connection' })).toBeInTheDocument()
    })

    it('populates the search query from a real agent run when the Electron bridge is available', async () => {
        mockMatchMedia(false)
        installAgentBridge('Beta')
        renderWindow()

        typeQuery('find the beta card')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('Beta'))
    })

    it('does not recreate the search RegExp agent on window re-render', () => {
        mockMatchMedia(false)
        installAgentBridge('Beta')
        const createSearchRegexpAgent = vi.spyOn(searchRegexpAgent, 'createSearchRegexpAgent')
        renderWindow()

        fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'working' } })

        expect(createSearchRegexpAgent).toHaveBeenCalledTimes(1)
    })

    it('reports the RegExp agent as unavailable without the Electron bridge', async () => {
        mockMatchMedia(false)
        delete window.md2Actions
        renderWindow()

        typeQuery('alpha only')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByText('RegExp agent is not available')).toBeInTheDocument())
        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('alpha only')
    })
})
