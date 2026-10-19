import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { ActiveScheduleItem } from '../../services/actions/active_schedule_projection'
import { activeScheduleService, type ActiveScheduleSnapshot } from '../../services/actions/active_schedule_service'
import { dataService, type DataServiceState } from '../../services/data/data_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActiveSchedulesIndicator } from './active_schedules_indicator'

const project = { branch: 'main', id: 'project-1', rootPath: 'C:/repo' }
const scheduleBridge = { deleteSchedule: vi.fn(), listActiveSchedules: vi.fn() } as unknown as ElectronActionBridge

function snapshot(itemCount: number): ActiveScheduleSnapshot {
    const items = Array.from({ length: itemCount }, () => ({}) as ActiveScheduleItem)

    return { deletingScheduleIds: [], error: null, expandedScheduleIds: [], items, loading: false, selectedScheduleId: null }
}

function mockProject(projectReference: typeof project | null) {
    const state = { project: projectReference, runningAgents: [], snapshot: null } as unknown as DataServiceState
    vi.spyOn(dataService, 'getState').mockReturnValue(state)
}

function renderIndicator() {
    return render(
        <AppThemeProvider>
            <ActiveSchedulesIndicator />
        </AppThemeProvider>,
    )
}

describe('ActiveSchedulesIndicator', () => {
    beforeEach(() => {
        setActionBridgeOverride(scheduleBridge)
        mockProject(project)
        vi.spyOn(activeScheduleService, 'getSnapshot').mockReturnValue(snapshot(0))
    })

    afterEach(() => {
        cleanup()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('renders the active schedule count with an accessible name', () => {
        vi.spyOn(activeScheduleService, 'getSnapshot').mockReturnValue(snapshot(2))
        renderIndicator()

        expect(screen.getByRole('button', { name: 'Active schedules: 2' })).toHaveTextContent('2')
    })

    it('renders a zero count', () => {
        renderIndicator()

        expect(screen.getByRole('button', { name: 'Active schedules: 0' })).toBeInTheDocument()
    })

    it('is hidden without an open project', () => {
        mockProject(null)
        renderIndicator()

        expect(screen.queryByRole('button', { name: /Active schedules/u })).not.toBeInTheDocument()
    })

    it('is hidden without a schedule backend', () => {
        setActionBridgeOverride(null)
        renderIndicator()

        expect(screen.queryByRole('button', { name: /Active schedules/u })).not.toBeInTheDocument()
    })

    it('updates the count after a service change', () => {
        renderIndicator()

        vi.spyOn(activeScheduleService, 'getSnapshot').mockReturnValue(snapshot(3))
        act(() => {
            activeScheduleService.dispatchEvent(new Event('changed'))
        })

        expect(screen.getByRole('button', { name: 'Active schedules: 3' })).toBeInTheDocument()
    })

    it('opens the active schedules dialog and closes it again', async () => {
        const user = userEvent.setup()
        renderIndicator()

        await user.click(screen.getByRole('button', { name: 'Active schedules: 0' }))
        const dialog = screen.getByRole('dialog', { name: 'Active schedules' })
        expect(dialog).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Close' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Active schedules' })).not.toBeInTheDocument())
    })
})
