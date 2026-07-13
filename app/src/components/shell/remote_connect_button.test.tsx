import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
    REMOTE_CONTROL_TOKEN_KEY,
} from '../../data/remote_control_connection'
import { OPEN_PROJECT_DIALOG_EVENT, type OpenProjectDialogDetail } from '../project_command_events'
import { RemoteConnectButton } from './remote_connect_button'

class MockWebSocket extends EventTarget {
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
        vi.unstubAllGlobals()
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
        const detail = (openProjectListener.mock.calls[0][0] as CustomEvent<OpenProjectDialogDetail>).detail
        expect(detail).toEqual({ source: 'remote' })
        window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, openProjectListener)
    })

    it('shows the connection error in the dialog when the connect fails', async () => {
        installWebSocket('error')
        render(<RemoteConnectButton />)

        const dialog = await connectTo('ws://192.168.0.10:1234', 'token-1')

        expect(await dialog.findByText('Remote-control connection failed')).toBeInTheDocument()
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
