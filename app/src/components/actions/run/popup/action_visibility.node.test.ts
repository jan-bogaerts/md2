import { describe, expect, it } from 'vitest'
import { BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT, type ActionDefinition } from '../../../../data/action_types'
import { allPopupActions, conversationLogActions } from './action_visibility'

function action(id: string): ActionDefinition {
    return { ...BUILTIN_CUSTOM_PROMPT, builtin: false, id, label: id }
}

describe('action visibility derivation', () => {
    it('shows every loaded user action and custom prompt in All mode', () => {
        const actions = allPopupActions([
            BUILTIN_CUSTOM_PROMPT,
            action('context-mismatch'),
            BUILTIN_REMARKABLE_CONVERT,
            action('current'),
        ])

        expect(actions.map(({ id }) => id)).toEqual(['context-mismatch', 'current', BUILTIN_CUSTOM_PROMPT.id])
    })

    it('shows loaded, removed, and custom-prompt actions only when conversations exist', () => {
        const loaded = [action('current'), action('without-log'), BUILTIN_CUSTOM_PROMPT]
        const conversations = [
            { actionId: 'current' },
            { actionId: 'removed' },
            { actionId: BUILTIN_CUSTOM_PROMPT.id },
            { actionId: null },
        ]

        const actions = conversationLogActions(loaded, conversations, new Map([['removed', 'Removed action']]))

        expect(actions.map(({ id }) => id)).toEqual(['current', 'removed', BUILTIN_CUSTOM_PROMPT.id])
        expect(actions.find(({ id }) => id === 'removed')?.label).toBe('Removed action')
    })

    it('returns an empty list without stored conversations', () => {
        expect(conversationLogActions([action('current'), BUILTIN_CUSTOM_PROMPT], [])).toEqual([])
    })
})
