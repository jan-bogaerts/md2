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
}

describe('RemoteControlConnectionInfo', () => {
    afterEach(cleanup)

    it('shows fragment-free hostname and IP connect links', () => {
        render(<RemoteControlConnectionInfo anchorEl={null} onClose={() => undefined} open status={status} />)

        expect(screen.getByText('http://192.168.1.20:8123/')).toBeInTheDocument()
        expect(screen.getByText('http://desktop.local:8123/')).toBeInTheDocument()
    })

    it('defaults copy to the IP connect link (Android-friendly)', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        render(<RemoteControlConnectionInfo anchorEl={null} onClose={() => undefined} open status={status} />)

        fireEvent.click(screen.getByRole('button', { name: /copy connect link/i }))

        expect(writeText).toHaveBeenCalledWith('http://192.168.1.20:8123/')
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })

    it('copies the hostname link once selected', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        render(<RemoteControlConnectionInfo anchorEl={null} onClose={() => undefined} open status={status} />)

        fireEvent.click(screen.getByText('http://desktop.local:8123/'))
        fireEvent.click(screen.getByRole('button', { name: /copy connect link/i }))

        expect(writeText).toHaveBeenCalledWith('http://desktop.local:8123/')
    })
})
