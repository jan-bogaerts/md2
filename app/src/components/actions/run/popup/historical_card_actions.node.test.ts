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
    it('keeps distinct command and conversation actions after definitions disappear or stop matching', () => {
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        activity.records.push(commandRecord('removed', 'Old command', 'done'))
        activity.records.push(commandRecord('removed', 'Old command', 'again'))
        activity.conversations.push({ actionId: 'agent-only', cardInternalId: 'card-1', id: 'conversation-1' } as typeof activity.conversations[number])
        const current = { ...BUILTIN_CUSTOM_PROMPT, id: 'current', label: 'Current', type: 'command' } as ActionDefinition
        const changed = { ...BUILTIN_CUSTOM_PROMPT, id: 'removed', label: 'New label', type: 'command' } as ActionDefinition

        const actions = historicalCardActions([current, BUILTIN_CUSTOM_PROMPT], [current, changed], [activity])

        expect(actions.map(({ id }) => id)).toEqual(['current', 'removed', 'agent-only', BUILTIN_CUSTOM_PROMPT.id])
        expect(actions.find(({ id }) => id === 'removed')?.label).toBe('New label')
        expect(actions.find(({ id }) => id === 'agent-only')?.type).toBe('agent')
        expect(historicalCardActions([BUILTIN_CUSTOM_PROMPT], [], [activity])[0].label).toBe('Old command')
    })

    it('reads only selected action runs from supplied card activity', () => {
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        activity.records.push(commandRecord('first', 'First', 'first output'))
        activity.records.push(commandRecord('second', 'Second', 'second output'))

        const entries = historicalActionHistory([activity], 'second', 'C:\\project')

        expect(entries).toMatchObject([{ output: 'second output', type: 'command' }])
    })
})
