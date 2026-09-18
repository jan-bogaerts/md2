import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { defaultScheduleAction } from './action_popup_defaults'

describe('defaultScheduleAction', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('refreshes active schedule view after backend registration succeeds', async () => {
        const registerActionSchedule = vi.fn(async () => undefined)
        setActionBridgeOverride({ registerActionSchedule } as unknown as ElectronActionBridge)
        projectAccessService.setReadOnly(false)
        const refresh = vi.spyOn(activeScheduleService, 'refresh').mockResolvedValue(undefined)
        const action = { id: 'implement' } as ActionDefinition
        const context = { cardInternalId: 'card-1', kind: 'card' as const }
        const trigger = { timestamp: '2026-09-19T10:00:00.000Z', type: 'at' as const }

        await defaultScheduleAction(action, context, trigger)

        expect(registerActionSchedule).toHaveBeenCalledWith({ actionId: 'implement', context, trigger })
        expect(refresh).toHaveBeenCalledOnce()
    })
})
