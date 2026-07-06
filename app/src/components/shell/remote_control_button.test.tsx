import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronRemoteControlBridge, RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { RemoteControlButton } from './remote_control_button'

const stoppedStatus: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null }
const startedStatus: RemoteControlStatus = { active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:1234' }

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

    it('starts remote control from the toolbar button', async () => {
        const bridge = installBridge()
        render(<RemoteControlButton />)

        fireEvent.click(await screen.findByRole('button', { name: 'Remote off' }))

        expect(bridge.start).toHaveBeenCalledTimes(1)
        expect(await screen.findByRole('button', { name: 'Remote on' })).toBeInTheDocument()
    })

    it('renders nothing outside Electron', () => {
        render(<RemoteControlButton />)

        expect(screen.queryByRole('button', { name: /Remote/ })).not.toBeInTheDocument()
    })
})
