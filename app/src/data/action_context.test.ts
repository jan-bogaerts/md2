import { describe, expect, it } from 'vitest'
import {
    actionMatchesContext,
    actionsForContext,
    cardContext,
    fileContext,
    folderContext,
    getCardType,
} from './action_context'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from './action_types'
import { DEFAULT_CARD_TYPES, type ProjectCard } from './data_types'

function action(name: string, appliesTo: ActionDefinition['appliesTo']): ActionDefinition {
    return {
        agent: null,
        appliesTo,
        builtin: false,
        command: 'run',
        description: name,
        icon: null,
        id: `action-${name}`,
        label: name,
        model: null,
        name,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        prompt: null,
        sourcePath: `actions/${name}.json`,
        thinkingLevel: null,
        type: 'command',
    }
}

function card(id: string, status: string | null): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, status, title: id,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

describe('getCardType', () => {
    it('maps an id prefix to the configured card type', () => {
        expect(getCardType(DEFAULT_CARD_TYPES, 'F-010')).toBe('feature')
        expect(getCardType(DEFAULT_CARD_TYPES, 'F_010')).toBe('feature')
        expect(getCardType(DEFAULT_CARD_TYPES, 'J-3')).toBe('job')
        expect(getCardType(DEFAULT_CARD_TYPES, 'B-7')).toBe('bug')
    })

    it('returns undefined for an unknown prefix', () => {
        expect(getCardType(DEFAULT_CARD_TYPES, 'X-1')).toBeUndefined()
    })
})

describe('cardContext / fileContext / folderContext', () => {
    it('derives type, state, file and kind for a card', () => {
        expect(cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES)).toEqual({
            file: 'design/F-010.md',
            kind: 'card',
            state: 'design',
            type: 'feature',
        })
    })

    it('omits state when the card has no status', () => {
        const context = cardContext(card('F-010', null), DEFAULT_CARD_TYPES)
        expect(context.state).toBeUndefined()
    })

    it('marks a file context with kind file', () => {
        expect(fileContext(card('F-010', 'design'), DEFAULT_CARD_TYPES).kind).toBe('file')
    })

    it('builds a folder context and flags special folders by name', () => {
        expect(folderContext('history', true)).toEqual({ folder: 'history', kind: 'folder', type: 'history' })
        expect(folderContext('sub')).toEqual({ folder: 'sub', kind: 'folder' })
    })
})

describe('actionMatchesContext', () => {
    const context = cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES)

    it('matches when every appliesTo field equals the context', () => {
        expect(actionMatchesContext(action('impl', { state: 'design', type: 'feature' }), context)).toBe(true)
    })

    it('rejects when any appliesTo field differs', () => {
        expect(actionMatchesContext(action('impl', { state: 'done', type: 'feature' }), context)).toBe(false)
        expect(actionMatchesContext(action('impl', { type: 'bug' }), context)).toBe(false)
    })

    it('rejects when appliesTo names a field absent from the context', () => {
        expect(actionMatchesContext(action('impl', { folder: 'history' }), context)).toBe(false)
    })

    it('always matches an action with no appliesTo, including the built-in custom prompt', () => {
        expect(actionMatchesContext(action('any', null), context)).toBe(true)
        expect(actionMatchesContext(BUILTIN_CUSTOM_PROMPT, context)).toBe(true)
        expect(actionMatchesContext(BUILTIN_CUSTOM_PROMPT, folderContext('history', true))).toBe(true)
    })
})

describe('actionsForContext', () => {
    it('keeps only matching actions in load order and always includes custom prompt', () => {
        const actions = [
            BUILTIN_CUSTOM_PROMPT,
            action('feature-only', { type: 'feature' }),
            action('bug-only', { type: 'bug' }),
        ]
        const result = actionsForContext(actions, cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES))

        expect(result.map((entry) => entry.name)).toEqual([BUILTIN_CUSTOM_PROMPT.name, 'feature-only'])
    })
})
