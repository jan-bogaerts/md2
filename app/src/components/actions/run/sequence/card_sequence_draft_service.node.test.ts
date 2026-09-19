import { describe, expect, it } from 'vitest'
import type { ActionScheduleTriggerSources } from '../schedule/action_schedule_trigger'
import { CardSequenceDraftService } from './card_sequence_draft_service'

const triggerSources: ActionScheduleTriggerSources = {
    accountTrackers: [{
        agent: 'codex',
        agentLabel: 'Codex',
        expectedResetAt: '2030-01-01T00:00:00.000Z',
        label: 'Primary',
        limitId: 'credits',
        usedPercent: 50,
        windowId: 'primary',
    }],
    cards: [
        { cardInternalId: 'trigger-card', label: 'Trigger', registrationState: 'todo' },
        { cardInternalId: 'card-1', label: 'First', registrationState: 'todo' },
    ],
    targetStates: ['ready'],
}

function readyService() {
    const service = new CardSequenceDraftService()
    service.open()
    service.updateSources({ actionIds: ['build'], cardsAvailable: true, readyStates: ['ready'], triggerSources })
    service.addCard('card-1')
    service.setActionId('build')
    service.setReadyState('ready')

    return service
}

describe('CardSequenceDraftService', () => {
    it('stores unique canonical ids and reorders without paths', () => {
        const service = readyService()
        service.addCard('card-2')
        service.addCard('card-1')
        service.addCard('card-3', 'card-2')
        service.reorderCard('card-1', null)

        expect(service.getSnapshot().cardInternalIds).toEqual(['card-3', 'card-2', 'card-1'])
    })

    it('invalidates an action removed from the every-card intersection', () => {
        const service = readyService()

        service.updateSources({ actionIds: ['review'], cardsAvailable: true, readyStates: ['ready'], triggerSources })

        expect(service.getSnapshot()).toMatchObject({ actionId: '', canSubmit: false })
    })

    it('requires card, common action, ready state, and complete trigger', () => {
        const service = readyService()
        expect(service.getSnapshot().canSubmit).toBe(true)

        service.setTriggerType('account-reset')
        expect(service.getSnapshot().canSubmit).toBe(false)
        service.setAgent('codex')
        service.setAccountTracker('credits', 'primary')
        expect(service.getSnapshot().canSubmit).toBe(true)
    })

    it('rejects a card-state trigger targeting a sequence member', () => {
        const service = readyService()
        service.setTriggerType('card-state')
        service.setTriggerCard('card-1')
        service.setTargetState('ready')

        expect(service.getSnapshot()).toMatchObject({
            canSubmit: false,
            validationMessage: 'Trigger card cannot be part of the sequence',
        })
    })

    it('builds now and scheduled registrations with selected values', () => {
        const service = readyService()
        expect(service.createRegistrationRequest()).toEqual({
            actionId: 'build',
            cardInternalIds: ['card-1'],
            readyState: 'ready',
            trigger: { type: 'now' },
        })

        service.setTriggerType('card-state')
        service.setTriggerCard('trigger-card')
        service.setTargetState('ready')
        expect(service.createRegistrationRequest().trigger).toEqual({
            cardInternalId: 'trigger-card',
            registrationState: 'todo',
            targetState: 'ready',
            type: 'card-state',
        })

        service.setTriggerType('account-reset')
        service.setAgent('codex')
        service.setAccountTracker('credits', 'primary')
        expect(service.createRegistrationRequest().trigger).toEqual({
            agent: 'codex',
            expectedResetAt: '2030-01-01T00:00:00.000Z',
            limitId: 'credits',
            type: 'account-reset',
            windowId: 'primary',
        })
    })
})
