import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import { dataService } from '../../../../services/data/data_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { defaultConvertPromptToAction, defaultScheduleAction } from './action_popup_defaults'

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

describe('defaultConvertPromptToAction', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('writes a streaming agent action with selected settings', async () => {
        vi.spyOn(dataService, 'getConfig').mockReturnValue({ actionsFolder: 'actions' } as never)
        vi.spyOn(dataService, 'getState').mockReturnValue({ snapshot: { repositoryFiles: [] } } as never)
        const saveProjectFile = vi.spyOn(dataService.cards, 'saveProjectFile').mockImplementation(async (file) => file)
        const context = { cardInternalId: 'card-1', kind: 'card' as const, type: 'feature' }

        const { definition, path } = await defaultConvertPromptToAction({
            agent: 'codex', context, label: 'Review result', model: 'gpt-5.5',
            permissionMode: 'ask-for-approval', prompt: 'Review this result',
        })

        expect(path).toBe('actions/review-result.json')
        expect(definition.streaming).toBe(true)
        const savedFile = saveProjectFile.mock.calls[0]?.[0]
        if (!savedFile) throw new Error('Missing saved action file')
        expect(JSON.parse(savedFile.content)).toMatchObject({
            agent: 'codex', model: 'gpt-5.5', permissionMode: 'ask-for-approval',
            streaming: true, type: 'agent',
        })
    })
})
