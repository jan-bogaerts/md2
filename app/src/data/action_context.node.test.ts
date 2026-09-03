import { describe, expect, it } from 'vitest'
import {
    ACTION_CONTEXT_FILTER_DESCRIPTORS,
    actionContextIdentity,
    actionMatchesContext,
    actionsForContext,
    cardContext,
    diagramContext,
    displayActionsForContext,
    fileContext,
    folderContext,
    getCardType,
    projectContext,
    projectContextWithWorktree,
    validateActionContextFilterValue,
} from './action_context'
import { BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT, type ActionDefinition } from './action_types'
import { DEFAULT_CARD_TYPES, type Card } from './data_types'

function action(name: string, appliesTo: ActionDefinition['appliesTo']): ActionDefinition {
    return {
        agent: null,
        appliesTo,
        permissionMode: null,
        builtin: false,
        command: 'run',
        description: name,
        icon: null,
        id: `action-${name}`,
        label: name,
        model: null,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        output: null,
        phrases: [],
        prompt: null,
        showCommandWindow: false,
        sourcePath: `actions/${name}.json`,
        thinkingLevel: null,
        trackFileChanges: false,
        streaming: false,
        type: 'command',
    }
}

function card(id: string, status: string | null): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, references: [], status, title: id,
        },
        hasFrontmatter:true,
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

describe('action context filter descriptors', () => {
    it('describes every declared filterable context field', () => {
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.map(({ key }) => key)).toEqual([
            'kind', 'type', 'state', 'file', 'folder', 'worktree', 'worktreeError',
        ])
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => key === 'state')).toMatchObject({
            supportedContextKinds: ['card', 'file'],
            valueSource: 'state',
        })
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => key === 'folder')).toMatchObject({
            supportedContextKinds: ['folder'],
            valueSource: 'folder',
        })
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => key === 'worktree')).toMatchObject({
            supportedContextKinds: ['card', 'file', 'project'],
            valueSource: 'worktree',
        })
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => key === 'kind')?.supportedContextKinds)
            .toContain('merge-conflict')
        expect(ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => key === 'type')?.supportedContextKinds)
            .toContain('diagram')
    })

    it('requires a non-empty filter value', () => {
        expect(validateActionContextFilterValue('')).toBe('Required value')
        expect(validateActionContextFilterValue('value')).toBeNull()
    })
})

describe('cardContext / fileContext / folderContext / projectContext', () => {
    it('derives type, state, file, title and kind for a card', () => {
        expect(cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES)).toEqual({
            cardInternalId: 'f-010',
            file: 'design/F-010.md',
            kind: 'card',
            state: 'design',
            title: 'F-010',
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

    it('builds project-wide context without a card or file', () => {
        expect(projectContext()).toEqual({ kind: 'project' })
    })

    it('builds root and child diagram contexts', () => {
        expect(diagramContext('root')).toEqual({ kind: 'diagram', type: 'root' })
        expect(diagramContext('child', 'diagram-1', 'item-1', 'Orders')).toEqual({diagramId: 'diagram-1', diagramItemId: 'item-1', kind: 'diagram', parentNode: 'Orders', type: 'child'})
    })

    it('uses diagram and item IDs in child context identity without changing root identity scope', () => {
        expect(actionContextIdentity(diagramContext('root'))).toBe('diagram\0root\0\0')
        expect(actionContextIdentity(diagramContext('child', 'diagram-1', 'item-1', 'Orders')))
            .toBe('diagram\0child\0diagram-1\0item-1')
        expect(actionContextIdentity(diagramContext('child', 'diagram-1', 'item-2', 'Orders')))
            .not.toBe(actionContextIdentity(diagramContext('child', 'diagram-1', 'item-1', 'Orders')))
    })

    it('adds and removes a project-session worktree assignment', () => {
        expect(projectContextWithWorktree(projectContext(), 2)).toEqual({ kind: 'project', worktree: '2' })
        expect(projectContextWithWorktree({ kind: 'project', worktree: '2' }, null)).toEqual({ kind: 'project' })
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
    it('matches diagram actions by root or child type', () => {
        const actions = [
            action('root', { kind: 'diagram', type: 'root' }),
            action('child', { kind: 'diagram', type: 'child' }),
            action('project', { kind: 'project' }),
        ]

        expect(actionsForContext(actions, diagramContext('root')).map(({ id }) => id)).toEqual(['action-root'])
        expect(actionsForContext(actions, diagramContext('child', 'diagram-1', 'item-1', 'Orders')).map(({ id }) => id)).toEqual(['action-child'])
    })

    it('keeps generic and built-in custom actions out of diagram selectors', () => {
        const actions = [BUILTIN_CUSTOM_PROMPT, action('generic', null), action('root', { kind: 'diagram', type: 'root' })]

        expect(actionsForContext(actions, diagramContext('root')).map(({ id }) => id)).toEqual(['action-root'])
    })

    it('keeps only matching actions in load order and always includes custom prompt', () => {
        const actions = [
            BUILTIN_CUSTOM_PROMPT,
            BUILTIN_REMARKABLE_CONVERT,
            action('feature-only', { type: 'feature' }),
            action('bug-only', { type: 'bug' }),
        ]
        const result = actionsForContext(actions, cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES))

        expect(result.map((entry) => entry.id)).toEqual([BUILTIN_CUSTOM_PROMPT.id, 'action-feature-only'])
    })

    it('keeps generic and project actions out of card-specific context', () => {
        const actions = [
            BUILTIN_CUSTOM_PROMPT,
            action('project-only', { kind: 'project' }),
            action('card-only', { kind: 'card' }),
        ]

        expect(actionsForContext(actions, projectContext()).map(({ id }) => id))
            .toEqual([BUILTIN_CUSTOM_PROMPT.id, 'action-project-only'])
    })

    it('matches merge conflict actions by explicit context kind', () => {
        const context = { conflictFile: 'src/file.ts', conflictFiles: 'src/file.ts', conflictSessionId: 'session-1', kind: 'merge-conflict' as const }
        const actions = [action('conflict', { kind: 'merge-conflict' }), action('project', { kind: 'project' })]

        expect(actionsForContext(actions, context).map(({ id }) => id)).toEqual(['action-conflict'])
    })
})

describe('displayActionsForContext', () => {
    it('places the custom prompt after configured matching actions', () => {
        const actions = [BUILTIN_CUSTOM_PROMPT, action('feature-only', { type: 'feature' })]

        expect(displayActionsForContext(actions, cardContext(card('F-010', 'design'), DEFAULT_CARD_TYPES)).map(({ id }) => id))
            .toEqual(['action-feature-only', BUILTIN_CUSTOM_PROMPT.id])
    })
})
