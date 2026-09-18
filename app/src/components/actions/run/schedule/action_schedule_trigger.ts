import type { ActionScheduleTrigger } from '../../../../data/action_schedule_types'
import type { ActionScheduleAccountTracker, ActionScheduleCardOption } from './action_schedule_options'
import type { ActionScheduleSnapshot } from './action_schedule_store'

export interface ActionScheduleTriggerSources {
    accountTrackers: ActionScheduleAccountTracker[]
    cards: ActionScheduleCardOption[]
    targetStates: string[]
}

function createAtScheduleTrigger(timestampInput: string, now: number): ActionScheduleTrigger {
    const timestamp = timestampInput.trim()
    if (timestamp.length === 0) throw new Error('Timestamp is required for time schedules')
    const fireAt = Date.parse(timestamp)
    if (Number.isNaN(fireAt)) throw new Error('Schedule timestamp is invalid')
    if (fireAt <= now) throw new Error('Schedule time must be in the future')

    return { timestamp: new Date(fireAt).toISOString(), type: 'at' }
}

function createAccountResetScheduleTrigger(
    snapshot: Extract<ActionScheduleSnapshot, { triggerType: 'account-reset' }>,
    accountTrackers: ActionScheduleAccountTracker[],
): ActionScheduleTrigger {
    if (!snapshot.agent) throw new Error('Agent is required for account reset schedules')
    const tracker = accountTrackers.find(({ agent, limitId, windowId }) => (
        agent === snapshot.agent && limitId === snapshot.limitId && windowId === snapshot.windowId
    ))
    if (!tracker) throw new Error('Selected account tracker is unavailable')
    if (!tracker.expectedResetAt) throw new Error('Selected account tracker has no reset time')

    return {
        agent: tracker.agent,
        expectedResetAt: tracker.expectedResetAt,
        limitId: tracker.limitId,
        type: 'account-reset',
        windowId: tracker.windowId,
    }
}

function createCardStateScheduleTrigger(
    snapshot: Extract<ActionScheduleSnapshot, { triggerType: 'card-state' }>,
    cards: ActionScheduleCardOption[],
    targetStates: string[],
): ActionScheduleTrigger {
    const card = cards.find(({ cardInternalId }) => cardInternalId === snapshot.cardInternalId)
    if (!card) throw new Error('Selected trigger card is unavailable')
    if (!card.registrationState) throw new Error('Selected trigger card has no current state')
    if (!targetStates.includes(snapshot.targetState)) throw new Error('Selected target state is unavailable')

    return {
        cardInternalId: card.cardInternalId,
        registrationState: card.registrationState,
        targetState: snapshot.targetState,
        type: 'card-state',
    }
}

/** Validate active schedule fields and build only selected trigger payload. */
export function createScheduleTrigger(
    snapshot: ActionScheduleSnapshot,
    sources: ActionScheduleTriggerSources,
    now = Date.now(),
): ActionScheduleTrigger {
    if (snapshot.triggerType === 'at') return createAtScheduleTrigger(snapshot.timestamp, now)
    if (snapshot.triggerType === 'account-reset') {
        return createAccountResetScheduleTrigger(snapshot, sources.accountTrackers)
    }

    return createCardStateScheduleTrigger(snapshot, sources.cards, sources.targetStates)
}

export function canRegisterSchedule(snapshot: ActionScheduleSnapshot, sources: ActionScheduleTriggerSources, now = Date.now()) {
    try {
        createScheduleTrigger(snapshot, sources, now)
        return true
    } catch {
        return false
    }
}
