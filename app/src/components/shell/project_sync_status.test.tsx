import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectPersistenceSnapshot } from '../../services/project/project_persistence_service'
import type { ProjectSessionState } from '../../services/project/project_session_service'
import { ProjectSyncStatus } from './project_sync_status'

const hookState = vi.hoisted(() => ({
    persistence: {
        hasPendingPush: false,
        hasPendingSave: false,
        localSaveState: 'saved',
    } as ProjectPersistenceSnapshot,
    session: { isPushing: false } as ProjectSessionState,
}))

vi.mock('../hooks/use_project_persistence', () => ({ useProjectPersistence: () => hookState.persistence }))
vi.mock('../hooks/use_project_session', () => ({ useProjectSession: () => hookState.session }))

describe('ProjectSyncStatus', () => {
    afterEach(() => {
        cleanup()
        hookState.persistence = { hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' }
        hookState.session = { isPushing: false } as ProjectSessionState
    })

    it('shows synchronized save and push state', () => {
        render(<ProjectSyncStatus />)

        expect(screen.getByText('Saved locally')).toBeInTheDocument()
        expect(screen.getByText('Synced')).toBeInTheDocument()
    })

    it('shows dirty local changes and a pending push', () => {
        hookState.persistence = { hasPendingPush: true, hasPendingSave: true, localSaveState: 'dirty' }

        render(<ProjectSyncStatus />)

        expect(screen.queryByRole('progressbar', { name: 'Saving' })).not.toBeInTheDocument()
        expect(screen.getByText('Dirty')).toBeInTheDocument()
        expect(screen.getByText('Changes ready to push')).toBeInTheDocument()
    })

    it('shows local save progress', () => {
        hookState.persistence = { hasPendingPush: false, hasPendingSave: true, localSaveState: 'saving' }

        render(<ProjectSyncStatus />)

        expect(screen.getByRole('progressbar', { name: 'Saving' })).toBeInTheDocument()
        expect(screen.getByText('Saving changes...')).toBeInTheDocument()
        expect(screen.queryByText('Dirty')).not.toBeInTheDocument()
    })

    it('shows push progress instead of pending push state', () => {
        hookState.persistence = { hasPendingPush: true, hasPendingSave: false, localSaveState: 'saved' }
        hookState.session = { isPushing: true } as ProjectSessionState

        render(<ProjectSyncStatus />)

        expect(screen.getByRole('progressbar', { name: 'Pushing' })).toBeInTheDocument()
        expect(screen.getByText('Pushing...')).toBeInTheDocument()
        expect(screen.queryByText('Changes ready to push')).not.toBeInTheDocument()
    })
})
