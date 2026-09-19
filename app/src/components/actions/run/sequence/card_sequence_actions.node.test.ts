import { describe, expect, it } from 'vitest'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../../../../data/action_types'
import { DEFAULT_CARD_TYPES, type Card } from '../../../../data/data_types'
import { cardSequenceActions } from './card_sequence_actions'

function card(internalId: string, id: string, status: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        hasFrontmatter: true,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, changedFiles: [], id, internalId,
            owner: null, policy: {}, references: [], status, title: id, worktree: null, worktreeError: null, worktreeValue: null,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

function action(id: string, appliesTo?: ActionDefinition['appliesTo']): ActionDefinition {
    return { appliesTo: appliesTo ?? null, description: id, id, label: id, prompt: id, type: 'agent' } as ActionDefinition
}

describe('cardSequenceActions', () => {
    it('returns only configured actions applicable to every card', () => {
        const actions = [
            action('all'),
            action('feature', { type: 'feature' }),
            action('todo', { state: 'todo' }),
            BUILTIN_CUSTOM_PROMPT,
        ]

        expect(cardSequenceActions(actions, [card('one', 'F-1', 'todo'), card('two', 'B-2', 'todo')], DEFAULT_CARD_TYPES)
            .map(({ id }) => id)).toEqual(['all', 'todo'])
    })

    it('returns no actions before a card is selected', () => {
        expect(cardSequenceActions([action('all')], [], DEFAULT_CARD_TYPES)).toEqual([])
    })
})
