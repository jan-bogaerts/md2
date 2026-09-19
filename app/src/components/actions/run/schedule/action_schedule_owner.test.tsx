import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { useClaudeRateLimits } from '../../../hooks/use_claude_rate_limits'
import { useCodexRateLimits } from '../../../hooks/use_codex_rate_limits'
import { useProjectConfig } from '../../../hooks/use_project_config'
import { defaultScheduleAction } from '../popup/action_popup_defaults'
import { ActionScheduleOwner } from './action_schedule_owner'
import { ActionScheduleStore } from './action_schedule_store'

vi.mock('../../../hooks/use_claude_rate_limits', () => ({ useClaudeRateLimits: vi.fn() }))
vi.mock('../../../hooks/use_codex_rate_limits', () => ({ useCodexRateLimits: vi.fn() }))
vi.mock('../../../hooks/use_project_config', () => ({ useProjectConfig: vi.fn() }))
vi.mock('../popup/action_popup_defaults', () => ({ defaultScheduleAction: vi.fn() }))

const action = { id: 'implement', label: 'Implement' } as ActionDefinition
const context = { cardInternalId: 'card-1', kind: 'card' as const }

function configureSources() {
    vi.mocked(useClaudeRateLimits).mockReturnValue({ receivedAt: null, snapshot: null, stale: false })
    vi.mocked(useCodexRateLimits).mockReturnValue({ receivedAt: null, snapshot: null, stale: false })
    vi.mocked(useProjectConfig).mockReturnValue(null)
    vi.spyOn(dataService, 'getState').mockReturnValue({ project: null, runningAgents: [], snapshot: null })
}

function openDateStore() {
    const store = new ActionScheduleStore()
    store.setTimestamp('2099-07-07T10:30')
    store.toggle()

    return store
}

describe('ActionScheduleOwner registration', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('registers selected trigger and keeps success inline', async () => {
        configureSources()
        vi.mocked(defaultScheduleAction).mockResolvedValue(undefined)
        render(<ActionScheduleOwner action={action} context={context} store={openDateStore()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Schedule action' }))

        await waitFor(() => expect(defaultScheduleAction).toHaveBeenCalledWith(
            action,
            context,
            { timestamp: new Date('2099-07-07T10:30').toISOString(), type: 'at' },
        ))
        expect(await screen.findByRole('status')).toHaveTextContent('Schedule registered')
    })

    it('reports backend errors through dialogService without crashing form', async () => {
        configureSources()
        const error = new Error('Backend unavailable')
        vi.mocked(defaultScheduleAction).mockRejectedValue(error)
        const reportError = vi.spyOn(dialogService, 'error')
        render(<ActionScheduleOwner action={action} context={context} store={openDateStore()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Schedule action' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(error, { fallbackMessage: 'Could not register schedule' }))
        expect(screen.getByRole('button', { name: 'Schedule action' })).toBeInTheDocument()
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
})
