import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        // The auto-opened popover marks the toolbar aria-hidden, so query it with hidden: true.
        expect(await screen.findByRole('button', { name: 'Disconnect', hidden: true })).toBeInTheDocument()
    })

    it('auto-opens the connection-info popover after a successful start', async () => {
        installBridge()
        render(<RemoteControlButton />)

        fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))

        expect(await screen.findByRole('button', { name: 'Copy connect link' })).toBeInTheDocument()
        expect(screen.getByText('ws://127.0.0.1:1234')).toBeInTheDocument()
    })

    it('shows the disconnect tooltip while active', async () => {
        installBridge()
        render(<RemoteControlButton />)

        fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
        // Close the auto-opened popover so the toolbar is no longer aria-hidden.
        fireEvent.click(await screen.findByRole('button', { name: 'show connect link and QR code', hidden: true }))
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Copy connect link' })).not.toBeInTheDocument())

        fireEvent.mouseOver(await screen.findByRole('button', { name: 'Disconnect' }))

        expect(await screen.findByText('disconnect')).toBeInTheDocument()
    })

    it('toggles the popover with the arrow button', async () => {
        installBridge()
        render(<RemoteControlButton />)

        fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
        expect(await screen.findByRole('button', { name: 'Copy connect link' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'show connect link and QR code', hidden: true }))
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Copy connect link' })).not.toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: 'show connect link and QR code' }))
        expect(await screen.findByRole('button', { name: 'Copy connect link' })).toBeInTheDocument()
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
