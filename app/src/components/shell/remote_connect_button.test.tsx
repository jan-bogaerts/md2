import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
    REMOTE_CONTROL_TOKEN_KEY,
} from '../../data/remote_control_connection'
import { projectSessionService } from '../../services/project_session_service'
import { OPEN_PROJECT_DIALOG_EVENT, type OpenProjectDialogDetail } from '../project_command_events'
import { RemoteConnectButton } from './remote_connect_button'

class MockWebSocket extends EventTarget {
    static activeProject: ProjectReference | null = null
    static behavior: 'open' | 'error' = 'open'

    readyState = 0
    protocol: string | string[] | undefined
    sent: string[] = []
    url: string

    constructor(url: string, protocol?: string | string[]) {
        super()
        this.protocol = protocol
        this.url = url
        queueMicrotask(() => {
            if (MockWebSocket.behavior === 'open') {
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
        if (request.method !== 'getActiveProject') return

        queueMicrotask(() => {
            this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: request.id, result: MockWebSocket.activeProject }) }))
        })
    }

    close() {
        this.readyState = 3
        this.dispatchEvent(new Event('close'))
    }
}

function installWebSocket(behavior: 'open' | 'error') {
    MockWebSocket.behavior = behavior
    vi.stubGlobal('WebSocket', MockWebSocket)
}

function openConnectDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    return within(screen.getByRole('dialog'))
}

async function connectTo(endpoint: string, token: string) {
    const dialog = openConnectDialog()
    fireEvent.change(dialog.getByLabelText('Endpoint'), { target: { value: endpoint } })
    fireEvent.change(dialog.getByLabelText('Token'), { target: { value: token } })
    fireEvent.click(dialog.getByRole('button', { name: 'Connect' }))

    return dialog
}

describe('RemoteConnectButton', () => {
    afterEach(() => {
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_TOKEN_KEY)
        window.location.hash = ''
        MockWebSocket.activeProject = null
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        cleanup()
    })

    it('shows empty fields on first run', () => {
        render(<RemoteConnectButton />)

        const dialog = openConnectDialog()

        expect(dialog.getByLabelText('Endpoint')).toHaveValue('')
        expect(dialog.getByLabelText('Token')).toHaveValue('')
    })

    it('prefills the dialog from the stored connection settings', () => {
        configureRemoteControlConnection({ endpoint: 'ws://192.168.0.10:1234', token: 'token-1' })
        render(<RemoteConnectButton />)

        const dialog = openConnectDialog()

        expect(dialog.getByLabelText('Endpoint')).toHaveValue('ws://192.168.0.10:1234')
        expect(dialog.getByLabelText('Token')).toHaveValue('token-1')
    })

    it('persists the settings, shows connected state and opens the remote project flow on confirm', async () => {
        installWebSocket('open')
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234', 'token-1')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        expect(window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)).toBe('ws://192.168.0.10:1234')
        expect(window.localStorage.getItem(REMOTE_CONTROL_TOKEN_KEY)).toBe('token-1')
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('loads the desktop app\'s active project directly and skips the open-project dialog', async () => {
        installWebSocket('open')
        MockWebSocket.activeProject = { branch: 'main', id: '/repo', rootPath: '/repo' }
        const openProjectSpy = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234', 'token-1')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(openProjectSpy).toHaveBeenCalledWith('remote', MockWebSocket.activeProject, null))
        expect(openProjectListener).not.toHaveBeenCalled()
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('falls back to the open-project dialog, prefilled with the active project, when loading it fails', async () => {
        installWebSocket('open')
        const activeProject = { branch: 'main', id: '/repo', rootPath: '/repo' }
        MockWebSocket.activeProject = activeProject
        vi.spyOn(projectSessionService, 'openProject').mockRejectedValue(new Error('load failed'))
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        render(<RemoteConnectButton />)

        await connectTo('ws://192.168.0.10:1234', 'token-1')

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ project: activeProject, source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('shows the connection error in the dialog when the connect fails', async () => {
        installWebSocket('error')
        render(<RemoteConnectButton />)

        const dialog = await connectTo('ws://192.168.0.10:1234', 'token-1')

        expect(await dialog.findByText('Remote-control connection failed')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })

    it('auto-connects from a token fragment without opening the dialog', async () => {
        installWebSocket('open')
        const openProjectListener = vi.fn()
        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
        window.location.hash = '#frag-token'
        render(<RemoteConnectButton />)

        expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(window.localStorage.getItem(REMOTE_CONTROL_TOKEN_KEY)).toBe('frag-token')
        await waitFor(() => expect(openProjectListener).toHaveBeenCalledOnce())
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('opens the dialog with the connection error when a fragment token is stale', async () => {
        installWebSocket('error')
        window.location.hash = '#stale-token'
        render(<RemoteConnectButton />)

        const dialog = within(await screen.findByRole('dialog'))
        expect(await dialog.findByText('Remote-control connection failed')).toBeInTheDocument()
    })

    it('does not auto-connect without a token fragment', () => {
        installWebSocket('open')
        render(<RemoteConnectButton />)

        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })

    it('disconnects from the connected dialog', async () => {
        installWebSocket('open')
        render(<RemoteConnectButton />)
        await connectTo('ws://192.168.0.10:1234', 'token-1')

        fireEvent.click(await screen.findByRole('button', { name: 'Connected' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' }))

        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })
})
