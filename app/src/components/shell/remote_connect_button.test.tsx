import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import { RemoteConnectButton } from './remote_connect_button'

const mocks = vi.hoisted(() => {
    const activeProject: ProjectReference = { branch: 'main', id: '/repo', rootPath: '/repo' }
    const storage = { getActiveProject: vi.fn(async () => activeProject) }
    const connectionSnapshot = {
        endpoint: 'ws://192.168.0.10:1234',
        errorMessage: 'Remote-control connection failed',
        status: 'disconnected' as const,
    }

    return {
        activeProject,
        connect: vi.fn(async () => storage),
        disconnect: vi.fn(),
        getSnapshot: vi.fn(() => connectionSnapshot),
        openProject: vi.fn(async () => null),
        runProjectOpenFlow: vi.fn(async (operation: () => Promise<void>) => operation()),
        subscribe: vi.fn(() => () => undefined),
    }
})

vi.mock('../../data/remote_connect_string', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../data/remote_connect_string')>()

    return { ...actual, deriveAutoConnectSettings: vi.fn(() => null) }
})

vi.mock('../../services/data/remote_connection_service', () => ({
    remoteConnectionService: {
        connect: mocks.connect,
        disconnect: mocks.disconnect,
        getSnapshot: mocks.getSnapshot,
        runProjectOpenFlow: mocks.runProjectOpenFlow,
        subscribe: mocks.subscribe,
    },
}))

vi.mock('../../services/project/project_session_service', () => ({ projectSessionService: { openProject: mocks.openProject } }))

describe('RemoteConnectButton startup failure', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens the stored connection error on mount and retries the remote project flow', async () => {
        const user = userEvent.setup()
        render(<RemoteConnectButton />)

        const dialog = within(screen.getByRole('dialog'))
        expect(dialog.getByText('Remote-control connection failed')).toBeInTheDocument()
        await user.type(dialog.getByLabelText('Endpoint'), 'ws://192.168.0.10:1234')
        await user.click(dialog.getByRole('button', { name: 'Connect' }))

        await waitFor(() => expect(mocks.openProject).toHaveBeenCalledWith(
            'remote',
            mocks.activeProject,
            null,
            expect.anything(),
        ))
        expect(mocks.connect).toHaveBeenCalledWith({ endpoint: 'ws://192.168.0.10:1234' })
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
})
