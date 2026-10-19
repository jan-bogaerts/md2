import { describe, expect, it, vi } from 'vitest'
import type { SequenceSchedule } from '../../../../data/action_schedule_types'
import type { ElectronActionBridge, SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import { registerCardSequence } from './card_sequence_registration'

const request: SequenceScheduleRegistrationRequest = {
    actionId: 'build',
    cardInternalIds: ['card-1'],
    readyState: 'ready',
    trigger: { type: 'now' },
}

const persistedSchedule: SequenceSchedule = {
    actionCompleted: false, actionId: 'build', cardInternalIds: ['card-1'], createdAt: '2026-10-17T10:00:00.000Z',
    currentIndex: 0, currentRunId: null, failure: null, id: 'sequence-1', kind: 'sequence',
    readyState: 'ready', readyStateMet: false, status: 'pending', trigger: { type: 'now' },
}

describe('registerCardSequence', () => {
    it('applies the persisted pending schedule without reloading active schedules', async () => {
        const bridge = { registerSequenceSchedule: vi.fn(async () => persistedSchedule) } as unknown as ElectronActionBridge
        const activeScheduleService = { applySchedule: vi.fn() }

        await registerCardSequence(request, { activeScheduleService, bridge })

        expect(bridge.registerSequenceSchedule).toHaveBeenCalledWith(request)
        expect(activeScheduleService.applySchedule).toHaveBeenCalledWith(persistedSchedule)
    })

    it('does not apply a schedule after failed registration', async () => {
        const failure = new Error('registration failed')
        const bridge = { registerSequenceSchedule: vi.fn(async () => { throw failure }) } as unknown as ElectronActionBridge
        const activeScheduleService = { applySchedule: vi.fn() }

        await expect(registerCardSequence(request, { activeScheduleService, bridge })).rejects.toBe(failure)
        expect(activeScheduleService.applySchedule).not.toHaveBeenCalled()
    })
})
