import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveScheduleSnapshot } from '../../../../services/actions/active_schedule_service'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import { dialogService } from '../../../../services/dialog_service'
import { workspaceNavigationService } from '../../../../services/project/workspace_navigation_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActiveSchedulesDialog } from './active_schedules_dialog'

const hookState = vi.hoisted(() => ({ snapshot: null as ActiveScheduleSnapshot | null }))

vi.mock('../../../hooks/use_active_schedules', () => ({ useActiveSchedules: () => hookState.snapshot }))

const sequence = {
    actionCompleted: true,
    actionId: 'implement',
    cardInternalIds: ['card-1', 'card-2'],
    createdAt: '2026-09-18T10:00:00.000Z',
    currentIndex: 1,
    currentRunId: 'run-1',
    failure: null,
    id: 'sequence-1',
    kind: 'sequence' as const,
    readyState: 'ready',
    readyStateMet: false,
    status: 'running' as const,
    trigger: { type: 'now' as const },
}

function snapshot(overrides: Partial<ActiveScheduleSnapshot> = {}): ActiveScheduleSnapshot {
    return {
        deletingScheduleIds: [],
        error: null,
        expandedScheduleIds: [],
        items: [{
            actionAvailable: true,
            actionLabel: 'Implement',
            schedule: sequence,
            target: { available: true, id: 'card-2', label: 'F-2 — Second', path: 'design/F-2.md' },
            tracker: null,
            triggerCard: null,
            unavailableReasons: [],
        }],
        loading: false,
        selectedScheduleId: 'sequence-1',
        ...overrides,
    }
}

function renderDialog(readOnly = false) {
    return render(
        <AppThemeProvider>
            <ActiveSchedulesDialog onClose={vi.fn()} open readOnly={readOnly} />
        </AppThemeProvider>,
    )
}

describe('ActiveSchedulesDialog', () => {
    beforeEach(() => {
        hookState.snapshot = snapshot()
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('expands sequence progress without changing selection', () => {
        const toggleExpanded = vi.spyOn(activeScheduleService, 'toggleExpanded').mockImplementation(() => undefined)
        const selectSchedule = vi.spyOn(activeScheduleService, 'selectSchedule').mockImplementation(() => undefined)
        hookState.snapshot = snapshot({ expandedScheduleIds: ['sequence-1'] })
        renderDialog()

        expect(screen.getByText('Sequence progress: card 2 of 2')).toBeInTheDocument()
        expect(screen.getByText('Current action completed: Yes; ready state met: No')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Collapse Implement schedule details' }))

        expect(toggleExpanded).toHaveBeenCalledWith('sequence-1')
        expect(selectSchedule).not.toHaveBeenCalled()
    })

    it('opens selected target by internal ID and supports row double-click', () => {
        const openCard = vi.spyOn(workspaceNavigationService, 'openCard').mockImplementation(() => undefined)
        vi.spyOn(activeScheduleService, 'selectSchedule').mockImplementation(() => undefined)
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        fireEvent.doubleClick(screen.getByRole('option', { name: 'Implement sequence schedule' }))

        expect(openCard).toHaveBeenNthCalledWith(1, 'card-2')
        expect(openCard).toHaveBeenNthCalledWith(2, 'card-2')
    })

    it('selects a row with keyboard input', () => {
        hookState.snapshot = snapshot({ selectedScheduleId: null })
        const selectSchedule = vi.spyOn(activeScheduleService, 'selectSchedule').mockImplementation(() => undefined)
        renderDialog()

        fireEvent.keyDown(screen.getByRole('option', { name: 'Implement sequence schedule' }), { key: 'Enter' })

        expect(selectSchedule).toHaveBeenCalledWith('sequence-1')
    })

    it('confirms running deletion with cancellation text and guards pending action', async () => {
        let resolveDelete: () => void = () => undefined
        const deletion = new Promise<void>((resolve) => {
            resolveDelete = resolve
        })
        const deleteSchedule = vi.spyOn(activeScheduleService, 'deleteSchedule').mockReturnValue(deletion)
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        const confirmation = screen.getByRole('dialog', { name: 'Delete schedule' })
        expect(within(confirmation).getByText('Delete this schedule? Its current action will be cancelled.')).toBeInTheDocument()
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
        expect(deleteSchedule).toHaveBeenCalledWith('sequence-1')

        resolveDelete()
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete schedule' })).not.toBeInTheDocument())
    })

    it('keeps unavailable records inspectable but disables Open', () => {
        hookState.snapshot = snapshot({
            expandedScheduleIds: ['sequence-1'],
            items: [{
                ...snapshot().items[0],
                target: { available: false, id: 'card-2', label: 'card-2', path: null },
                unavailableReasons: ['Target card unavailable: card-2'],
            }],
        })
        renderDialog()

        expect(screen.getByText('Target card unavailable: card-2')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
    })

    it('renders empty and load-error states', () => {
        hookState.snapshot = snapshot({ error: 'Backend unavailable', items: [], selectedScheduleId: null })
        renderDialog()

        expect(screen.getByText('Backend unavailable')).toBeInTheDocument()
        expect(screen.getByText('No active schedules')).toBeInTheDocument()
    })

    it('reports deletion errors through dialogService', async () => {
        vi.spyOn(activeScheduleService, 'deleteSchedule').mockRejectedValue(new Error('Delete failed'))
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as never)
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete schedule' })).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Schedule could not be deleted' }))
    })
})
