import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { RemoteControlConnectionInfo } from './remote_control_connection_info'

const status: RemoteControlStatus = {
    active: true,
    clientCount: 0,
    endpoint: 'ws://desktop.local:8123',
    hostnameEndpoint: 'ws://desktop.local:8123',
    ipEndpoints: ['ws://192.168.1.20:8123'],
    token: 'abc123',
}

describe('RemoteControlConnectionInfo', () => {
    afterEach(cleanup)

    it('shows hostname and IP endpoints', () => {
        render(<RemoteControlConnectionInfo anchorEl={null} onClose={() => undefined} open status={status} />)

        expect(screen.getByText('ws://desktop.local:8123')).toBeInTheDocument()
        expect(screen.getByText('ws://192.168.1.20:8123')).toBeInTheDocument()
    })

    it('copies the connect URL derived from the hostname endpoint and token', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        render(<RemoteControlConnectionInfo anchorEl={null} onClose={() => undefined} open status={status} />)

        fireEvent.click(screen.getByRole('button', { name: /copy connect link/i }))

        expect(writeText).toHaveBeenCalledWith('http://desktop.local:8123/#abc123')
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })
})
