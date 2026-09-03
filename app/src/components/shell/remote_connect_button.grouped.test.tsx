import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
} from '../../data/remote_control_connection'
import { deriveAutoConnectSettings } from '../../data/remote_connect_string'
import { projectSessionService } from '../../services/project/project_session_service'
import { remoteConnectionService } from '../../services/data/remote_connection_service'
import { configService } from '../../services/config/config_service'
import { OPEN_PROJECT_DIALOG_EVENT, type OpenProjectDialogDetail } from '../project_command_events'
import { RemoteConnectButton } from './remote_connect_button'

class MockWebSocket extends EventTarget {
    static activeProject: ProjectReference | null = null
    static behavior: 'open' | 'error' = 'open'
    static connectionCount = 0
    static behaviors: Array<'open' | 'error'> = []

    readyState = 0
    protocol: string | string[] | undefined
    sent: string[] = []
    url: string

    constructor(url: string, protocol?: string | string[]) {
        super()
        MockWebSocket.connectionCount += 1
        this.protocol = protocol
        this.url = url
        const behavior = MockWebSocket.behaviors.shift() ?? MockWebSocket.behavior
        queueMicrotask(() => {
            if (behavior === 'open') {
                this.readyState = 1
                this.dispatchEvent(new Event('open'))
                return
            }

            this.dispatchEvent(new Event('error'))
        })
    }

    send(message: string) {
        this.sent.push(message)
        const request = JSON.parse(message) as { id: string; method: string }
        const results: Record<string, unknown> = {
            getActiveProject: MockWebSocket.activeProject,
            getCodexRateLimits: null,
            loadActionRunRecoverySnapshot: { activeRunEvents: [], terminalResults: [] },
            loadAgentAvailability: {},
            loadDesktopConfig: {
                agent: 'custom',
                agentProfiles: [{ command: ['custom'], models: ['custom-model'], name: 'custom' }],
                codexSearchEnabled: true,
                editorCommand: 'code "{{file}}"',
                mergeConflictResolverCommand: '',
                model: 'custom-model',
                permissionMode: 'ask-for-approval',
                remoteControlPort: 20877,
                thinkingLevel: 'high',
            },
            onActionRun: { subscriptionId: 'actions-1' },
            onCodexRateLimits: { subscriptionId: 'rates-1' },
        }

        queueMicrotask(() => {
            this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: request.id, result: results[request.method] }) }))
        })
    }

    close() {
        this.readyState = 3
        this.dispatchEvent(new Event('close'))
    }
}

function installWebSocket(...behaviors: Array<'open' | 'error'>) {
    MockWebSocket.behaviors = [...behaviors]
    MockWebSocket.behavior = behaviors.at(-1) ?? 'open'
    vi.stubGlobal('WebSocket', MockWebSocket)
}

async function openConnectDialog() {
    const existingDialog = screen.queryByRole('dialog')
    if (existingDialog) return within(existingDialog)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))

    return within(screen.getByRole('dialog'))
}

async function connectTo(endpoint: string) {
    const dialog = await openConnectDialog()
    fireEvent.change(dialog.getByLabelText('Endpoint'), { target: { value: endpoint } })
    fireEvent.click(dialog.getByRole('button', { name: 'Connect' }))

    return dialog
}

describe('RemoteConnectButton', () => {
    beforeEach(() => {
        remoteConnectionService.disconnect()
        configService.init()
    })

    afterEach(() => {
        remoteConnectionService.disconnect()
        configService.clear()
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.location.hash = ''
        MockWebSocket.activeProject = null
        MockWebSocket.connectionCount = 0
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        cleanup()
    })

    it('shows endpoint-only fields after same-origin connection fails', async () => {
        installWebSocket('error')
        render(<RemoteConnectButton />)

        const dialog = await openConnectDialog()

        expect(dialog.getByLabelText('Endpoint')).toHaveValue('')
        expect(dialog.queryByLabelText('Token')).not.toBeInTheDocument()
    })

    it('prefills the dialog from the stored endpoint', async () => {
        installWebSocket('error')
        configureRemoteControlConnection({ endpoint: 'ws://192.168.0.10:1234' })
        render(<RemoteConnectButton />)

        const dialog = await openConnectDialog()

        expect(dialog.getByLabelText('Endpoint')).toHaveValue('ws://192.168.0.10:1234')
        expect(dialog.queryByLabelText('Token')).not.toBeInTheDocument()
    })

    it('persists the settings, shows connected state and opens the remote project flow on confirm', async () => {
        installWebSocket('error', 'open')
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        expect(window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)).toBe('ws://192.168.0.10:1234')
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('loads the desktop app\'s active project directly and skips the open-project dialog', async () => {
        installWebSocket('error', 'open')
        MockWebSocket.activeProject = { branch: 'main', id: '/repo', rootPath: '/repo' }
        const openProjectSpy = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(openProjectSpy).toHaveBeenCalledWith('remote', MockWebSocket.activeProject, null, expect.anything()))
        expect(openProjectListener).not.toHaveBeenCalled()
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('surfaces the missing-working-folder resolution instead of a blank open-project dialog', async () => {
        installWebSocket('error', 'open')
        const activeProject = { branch: 'main', id: '/repo', rootPath: '/repo' }
        MockWebSocket.activeProject = activeProject
        const resolution = {
            existingFolderPaths: [],
            folders: [],
            hasProjectConfig: true,
            kind: 'project-folder-setup' as const,
            project: activeProject,
            storageType: 'remote' as const,
            values: {
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                diagramsFolder: 'diagrams',
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'working',
            },
        }
        vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(resolution)
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ project: activeProject, resolution, source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('falls back to the open-project dialog, prefilled with the active project, when loading it fails', async () => {
        installWebSocket('error', 'open')
        const activeProject = { branch: 'main', id: '/repo', rootPath: '/repo' }
        MockWebSocket.activeProject = activeProject
        vi.spyOn(projectSessionService, 'openProject').mockRejectedValue(new Error('load failed'))
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ project: activeProject, source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('shows the connection error in the dialog when the connect fails', async () => {
        installWebSocket('error', 'error')
        render(<RemoteConnectButton />)

        const dialog = await connectTo('ws://192.168.0.10:1234')

        expect(await dialog.findByText('Remote-control connection failed')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })

    it('auto-connects from same origin without a URL fragment', async () => {
        installWebSocket('open')
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)).toBe(`ws://${window.location.host}`)
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('reuses startup connection when same-origin auto-connect mounts', async () => {
        installWebSocket('open')
        const settings = deriveAutoConnectSettings(window.location.host, window.location.protocol)
        if (!settings) throw new Error('Expected same-origin connection settings')
        await remoteConnectionService.connect(settings)
        remoteConnectionService.setProjectStorageActive(true)
        const openProjectSpy = vi.spyOn(projectSessionService, 'openProject')

        render(<RemoteConnectButton />)

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(MockWebSocket.connectionCount).toBe(1))
        expect(openProjectSpy).not.toHaveBeenCalled()
    })

    it('keeps connected state across button remounts', async () => {
        installWebSocket('open')
        render(<RemoteConnectButton />)
        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()

        cleanup()
        render(<RemoteConnectButton />)

        expect(screen.getByRole('button', { name: 'Connected' })).toBeInTheDocument()
        expect(MockWebSocket.connectionCount).toBe(1)
    })

    it('opens the dialog when same-origin auto-connect fails', async () => {
        installWebSocket('error')
        render(<RemoteConnectButton />)

        const dialog = within(await screen.findByRole('dialog'))
        expect(await dialog.findByText('Remote-control connection failed')).toBeInTheDocument()
    })

    it('disconnects from the connected dialog', async () => {
        installWebSocket('open')
        render(<RemoteConnectButton />)
        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Connected' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' }))

        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })
})
