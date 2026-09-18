import { describe, expect, it, vi } from 'vitest'
import type { ElectronActionBridge, SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import { registerCardSequence } from './card_sequence_registration'

const request: SequenceScheduleRegistrationRequest = {
    actionId: 'build',
    cardInternalIds: ['card-1'],
    readyState: 'ready',
    trigger: { type: 'now' },
}

describe('registerCardSequence', () => {
    it('registers before refreshing active schedules', async () => {
        const calls: string[] = []
        const bridge = {registerSequenceSchedule: vi.fn(async () => { calls.push('register') })} as unknown as ElectronActionBridge
        const activeScheduleService = { refresh: vi.fn(async () => { calls.push('refresh') }) }

        await registerCardSequence(request, { activeScheduleService, bridge })

        expect(bridge.registerSequenceSchedule).toHaveBeenCalledWith(request)
        expect(calls).toEqual(['register', 'refresh'])
    })

    it('does not refresh after failed registration', async () => {
        const failure = new Error('registration failed')
        const bridge = { registerSequenceSchedule: vi.fn(async () => { throw failure }) } as unknown as ElectronActionBridge
        const activeScheduleService = { refresh: vi.fn(async () => undefined) }

        await expect(registerCardSequence(request, { activeScheduleService, bridge })).rejects.toBe(failure)
        expect(activeScheduleService.refresh).not.toHaveBeenCalled()
    })
})
