import { describe, expect, it } from 'vitest'
import { createActivityFile, type ActionActivityRecord } from '../../../../../../shared/card_activity.mjs'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../../../../data/action_types'
import { historicalActionHistory, historicalCardActions } from './historical_card_actions'

function commandRecord(actionId: string, label: string, output: string): ActionActivityRecord {
    return {
        commits: [],
        completedAt: '2026-08-01T12:01:00.000Z',
        conversationIds: [],
        details: { command: 'run', output, type: 'command' },
        origin: { cardInternalId: 'card-1', kind: 'card' },
        rootActionId: actionId,
        rootActionLabel: label,
        runId: `${actionId}-run`,
        startedAt: '2026-08-01T12:00:00.000Z',
        status: 'completed',
    }
}

describe('historicalCardActions', () => {
    it('shows only conversation-backed actions after definitions disappear or stop matching', () => {
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        activity.records.push(commandRecord('removed', 'Old command', 'done'))
        activity.records.push(commandRecord('agent-only', 'Old agent', 'metadata'))
        activity.conversations.push({ actionId: 'agent-only', cardInternalId: 'card-1', id: 'conversation-1' } as typeof activity.conversations[number])
        activity.conversations.push({ actionId: BUILTIN_CUSTOM_PROMPT.id, cardInternalId: 'card-1', id: 'conversation-2' } as typeof activity.conversations[number])
        const current = { ...BUILTIN_CUSTOM_PROMPT, builtin: false, id: 'current', label: 'Current' } as ActionDefinition
        const changed = { ...BUILTIN_CUSTOM_PROMPT, builtin: false, id: 'agent-only', label: 'New label' } as ActionDefinition

        const actions = historicalCardActions([current, changed, BUILTIN_CUSTOM_PROMPT], [activity])

        expect(actions.map(({ id }) => id)).toEqual(['agent-only', BUILTIN_CUSTOM_PROMPT.id])
        expect(actions.find(({ id }) => id === 'agent-only')?.label).toBe('New label')
        expect(historicalCardActions([BUILTIN_CUSTOM_PROMPT], [activity])[0].label).toBe('Old agent')
    })

    it('reads only selected action runs from supplied card activity', () => {
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        activity.records.push(commandRecord('first', 'First', 'first output'))
        activity.records.push(commandRecord('second', 'Second', 'second output'))

        const entries = historicalActionHistory([activity], 'second', 'C:\\project')

        expect(entries).toMatchObject([{ output: 'second output', type: 'command' }])
    })
})
