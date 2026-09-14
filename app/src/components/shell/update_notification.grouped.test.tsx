import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronUpdateBridge, UpdateSnapshot } from '../../data/electron_update_bridge'
import { UpdateService } from '../../services/update_service'
import { UpdateNotification } from './update_notification'

const availableSnapshot: UpdateSnapshot = {
    error: null,
    received: 0,
    state: 'available',
    total: null,
    version: '0.6.0',
}

function createHarness(snapshot: UpdateSnapshot = availableSnapshot) {
    let changedCallback: (nextSnapshot: UpdateSnapshot) => void = () => undefined
    const bridge: ElectronUpdateBridge = {
        dismiss: vi.fn().mockResolvedValue(undefined),
        getSnapshot: vi.fn().mockResolvedValue(snapshot),
        install: vi.fn().mockResolvedValue(undefined),
        onChanged: vi.fn((callback) => {
            changedCallback = callback

            return vi.fn()
        }),
    }
    const service = new UpdateService(() => bridge)

    return {
        bridge,
        emitChanged: (nextSnapshot: UpdateSnapshot) => act(() => changedCallback(nextSnapshot)),
        service,
    }
}

describe('UpdateNotification', () => {
    afterEach(cleanup)

    it('renders nothing for idle state', () => {
        const { service } = createHarness({ error: null, received: 0, state: 'idle', total: null, version: null })
        const { container } = render(<UpdateNotification service={service} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('shows released version with dismiss and install actions', async () => {
        const { service } = createHarness()
        await service.start()

        render(<UpdateNotification service={service} />)

        expect(screen.getByText('Version 0.6.0 is available.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    })

    it('starts install once and renders determinate progress', async () => {
        const user = userEvent.setup()
        const { bridge, emitChanged, service } = createHarness()
        await service.start()
        render(<UpdateNotification service={service} />)

        await user.dblClick(screen.getByRole('button', { name: 'Install' }))
        expect(bridge.install).toHaveBeenCalledOnce()
        expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')

        emitChanged({ error: null, received: 25, state: 'downloading', total: 100, version: '0.6.0' })
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    })

    it('renders launching state', async () => {
        const { emitChanged, service } = createHarness()
        await service.start()
        render(<UpdateNotification service={service} />)

        emitChanged({ error: null, received: 100, state: 'launching', total: 100, version: '0.6.0' })

        expect(screen.getByText(/Launching installer/)).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('dismisses offer until Electron startup state changes', async () => {
        const user = userEvent.setup()
        const { bridge, service } = createHarness()
        await service.start()
        render(<UpdateNotification service={service} />)

        await user.click(screen.getByRole('button', { name: 'Dismiss' }))

        expect(bridge.dismiss).toHaveBeenCalledOnce()
        expect(screen.queryByText('Version 0.6.0 is available.')).not.toBeInTheDocument()
    })

    it('shows install failure and retries', async () => {
        const user = userEvent.setup()
        const errorSnapshot: UpdateSnapshot = {
            error: 'Could not install version 0.6.0. Try again.',
            received: 0,
            state: 'error',
            total: null,
            version: '0.6.0',
        }
        const { bridge, service } = createHarness(errorSnapshot)
        await service.start()
        render(<UpdateNotification service={service} />)

        expect(screen.getByRole('alert')).toHaveTextContent(errorSnapshot.error ?? '')
        await user.click(screen.getByRole('button', { name: 'Retry' }))

        expect(bridge.install).toHaveBeenCalledOnce()
    })
})
