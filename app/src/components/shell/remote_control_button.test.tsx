import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronRemoteControlBridge, RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { RemoteControlButton } from './remote_control_button'

const stoppedStatus: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null, token: null }
const startedStatus: RemoteControlStatus = { active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:1234', token: 'token-1' }

function installBridge(overrides: Partial<ElectronRemoteControlBridge> = {}) {
    const bridge: ElectronRemoteControlBridge = {
        getStatus: vi.fn().mockResolvedValue(stoppedStatus),
        onStatusChange: vi.fn().mockReturnValue(() => undefined),
        start: vi.fn().mockResolvedValue(startedStatus),
        stop: vi.fn().mockResolvedValue(stoppedStatus),
        ...overrides,
    }
    window.md2RemoteControl = bridge

    return bridge
}

describe('RemoteControlButton', () => {
    afterEach(() => {
        delete window.md2RemoteControl
        cleanup()
    })

    it('starts remote control from the Accept button', async () => {
        const bridge = installBridge()
        render(<RemoteControlButton />)

        fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))

        expect(bridge.start).toHaveBeenCalledTimes(1)
        expect(await screen.findByRole('button', { name: 'Stop accepting' })).toBeInTheDocument()
    })

    it('shows the accept tooltip when idle and does not expose the token', async () => {
        installBridge()
        render(<RemoteControlButton />)

        const button = await screen.findByRole('button', { name: 'Accept' })
        fireEvent.mouseOver(button)

        expect(await screen.findByRole('tooltip')).toHaveTextContent('accept external connection for web control')
        expect(screen.queryByText(/token/)).not.toBeInTheDocument()
    })

    it('renders the Connect button outside Electron', () => {
        render(<RemoteControlButton />)

        expect(screen.queryByRole('button', { name: /Accept/ })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })

    it('does not render the Connect button inside Electron', async () => {
        installBridge()
        render(<RemoteControlButton />)

        expect(await screen.findByRole('button', { name: 'Accept' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument()
    })
})
