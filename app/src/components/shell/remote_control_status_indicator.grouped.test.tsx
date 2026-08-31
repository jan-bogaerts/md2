import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronRemoteControlBridge, RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { RemoteControlStatusIndicator } from './remote_control_status_indicator'

const stoppedStatus: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null }
const acceptingStatus: RemoteControlStatus = { active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:1234' }
const connectedStatus: RemoteControlStatus = { active: true, clientCount: 1, endpoint: 'ws://127.0.0.1:1234' }

function installBridge() {
    let push: (status: RemoteControlStatus) => void = () => undefined
    const bridge: ElectronRemoteControlBridge = {
        getStatus: vi.fn().mockResolvedValue(stoppedStatus),
        onStatusChange: vi.fn((callback: (status: RemoteControlStatus) => void) => {
            push = callback

            return () => undefined
        }),
        start: vi.fn().mockResolvedValue(acceptingStatus),
        stop: vi.fn().mockResolvedValue(stoppedStatus),
    }
    window.md2RemoteControl = bridge

    return { emit: (status: RemoteControlStatus) => act(() => push(status)) }
}

describe('RemoteControlStatusIndicator', () => {
    afterEach(() => {
        delete window.md2RemoteControl
        cleanup()
    })

    it('renders nothing outside Electron', () => {
        const { container } = render(<RemoteControlStatusIndicator />)

        expect(container).toBeEmptyDOMElement()
    })

    it('shows nothing while inactive, then accepting and connected as status changes', async () => {
        const { emit } = installBridge()
        render(<RemoteControlStatusIndicator />)

        await act(async () => undefined) // flush the initial getStatus load
        expect(screen.queryByText('accepting')).not.toBeInTheDocument()

        emit(acceptingStatus)
        expect(await screen.findByText('accepting')).toBeInTheDocument()

        emit(connectedStatus)
        expect(await screen.findByText('connected')).toBeInTheDocument()

        emit(acceptingStatus)
        expect(await screen.findByText('accepting')).toBeInTheDocument()

        emit(stoppedStatus)
        expect(screen.queryByText('accepting')).not.toBeInTheDocument()
        expect(screen.queryByText('connected')).not.toBeInTheDocument()
    })

    it('shows active state in a mobile row', async () => {
        const { emit } = installBridge()
        render(<RemoteControlStatusIndicator mobile />)

        await act(async () => undefined)
        emit(acceptingStatus)

        expect(screen.getByText('Remote control')).toBeInTheDocument()
        expect(screen.getByText('Accepting')).toBeInTheDocument()
    })
})
