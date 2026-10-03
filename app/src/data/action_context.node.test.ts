import { afterEach, describe, expect, it, vi } from 'vitest'
import { worktreeService } from '../services/project/worktree_service';
import {
    ACTION_CONTEXT_FILTER_DESCRIPTORS,
    actionContextIdentity,
    actionMatchesContext,
    actionsForContext,
    cardContext,
    contextWithCurrentWorktree,
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
import { DEFAULT_CARD_TYPES, type Card, type WorktreeRecord } from './data_types'

const assignedWorktree: WorktreeRecord = {
    branch: 'feature/selected', error: null, parkingBranch: null, path: 'C:/feature', valid: true,
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false },
};
const otherWorktree: WorktreeRecord = { ...assignedWorktree, branch: 'other', path: 'C:/other' };

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

    it('uses diagram ID rather than reviewed text for reviewed root context identity', () => {
        const first = diagramContext('root', 'diagram-1', 'First reviewed text', 'review-1')
        const sameReview = diagramContext('root', 'diagram-1', 'Later reviewed text', 'review-1')
        const secondReview = diagramContext('root', 'diagram-1', 'First reviewed text', 'review-2')

        expect(first).toEqual({
            diagramChanges: 'First reviewed text', diagramChangeSetId: 'review-1', diagramId: 'diagram-1',
            kind: 'diagram', type: 'root',
        })
        expect(actionContextIdentity(first)).toBe(actionContextIdentity(sameReview))
        expect(actionContextIdentity(first)).not.toBe(actionContextIdentity(secondReview))
        expect(() => diagramContext('root', 'diagram-1', '', 'review-1')).toThrow('requires diagram, change-set, and change values')
        expect(() => actionContextIdentity({diagramChanges: 'First reviewed text', diagramId: 'diagram-1', kind: 'diagram', type: 'root'})).toThrow('Reviewed diagram identity requires diagram, change-set, and change values')
    })

    it('adds and removes a project-session worktree assignment', () => {
        expect(projectContextWithWorktree(projectContext(), 2, 'feature')).toEqual({ kind: 'project', worktree: '2', worktreeBranch: 'feature' })
        expect(projectContextWithWorktree({ kind: 'project', worktree: '2', worktreeBranch: 'feature' }, null, null)).toEqual({ kind: 'project' })
    })

    it('captures a card assignment branch while retaining its stable action identity', () => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktree = 6;
        assignedCard.header.worktreeValue = '6';
        assignedCard.header.branch = 'feature/selected';
        const context = cardContext(assignedCard, DEFAULT_CARD_TYPES);
        expect(context).toMatchObject({ worktree: '6', worktreeBranch: 'feature/selected' });
        expect(actionContextIdentity(context)).toBe(actionContextIdentity({ ...context, worktree: '1' }));
    });
})

describe('actionMatchesContext', () => {
    afterEach(() => vi.restoreAllMocks());
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

    it.each([cardContext, fileContext])('matches current checkout numbers without rewriting card metadata', (buildContext) => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktree = 2;
        assignedCard.header.worktreeValue = '2';
        assignedCard.header.branch = assignedWorktree.branch;
        const originalHeader = { ...assignedCard.header };
        const normalContext = buildContext(assignedCard, DEFAULT_CARD_TYPES, [otherWorktree, assignedWorktree]);
        const renumberedContext = buildContext(assignedCard, DEFAULT_CARD_TYPES, [assignedWorktree, otherWorktree]);
        const records = vi.spyOn(worktreeService, 'getRecords').mockReturnValue([otherWorktree, assignedWorktree]);

        expect(actionMatchesContext(action('normal', { worktree: '2' }), normalContext)).toBe(true);
        records.mockReturnValue([assignedWorktree, otherWorktree]);
        expect(actionMatchesContext(action('current', { worktree: '1' }), renumberedContext)).toBe(true);
        expect(actionMatchesContext(action('other', { worktree: '2' }), renumberedContext)).toBe(false);
        expect(assignedCard.header).toEqual(originalHeader);
        expect(actionContextIdentity(renumberedContext)).toBe(actionContextIdentity(normalContext));
    });

    it.each([
        ['unavailable', [otherWorktree]],
        ['invalid', [{ ...assignedWorktree, valid: false, error: 'missing folder' }]],
        ['duplicate', [assignedWorktree, assignedWorktree]],
    ])('rejects numeric worktree filters for an %s branch while keeping other filters usable', (_label, records) => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktreeValue = '2';
        assignedCard.header.branch = assignedWorktree.branch;
        const context = cardContext(assignedCard, DEFAULT_CARD_TYPES, records);
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue(records);

        expect(context.worktree).toBe('2');
        expect(actionMatchesContext(action('stale', { worktree: '2' }), context)).toBe(false);
        expect(actionMatchesContext(action('current', { worktree: '1' }), context)).toBe(false);
        expect(actionMatchesContext(action('state', { state: 'design' }), context)).toBe(true);
    });

    it.each(['0', '-1', 'broken', '9007199254740992'])('blocks invalid assignment %s even when the branch exists', (value) => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktreeValue = value;
        assignedCard.header.branch = assignedWorktree.branch;
        const context = cardContext(assignedCard, DEFAULT_CARD_TYPES, [assignedWorktree]);

        expect(context.worktreeError).toBe(`Invalid worktree index: ${value}`);
        expect(actionMatchesContext(action('invalid', { worktree: value }), context)).toBe(false);
    });

    it('blocks a missing assignment branch and preserves persisted assignment errors', () => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktreeValue = '2';
        const missingBranchContext = cardContext(assignedCard, DEFAULT_CARD_TYPES, [assignedWorktree]);
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([assignedWorktree]);
        expect(actionMatchesContext(action('missing-branch', { worktree: '2' }), missingBranchContext)).toBe(false);
        assignedCard.header.branch = assignedWorktree.branch;
        assignedCard.header.worktreeError = 'Needs repair';
        const context = cardContext(assignedCard, DEFAULT_CARD_TYPES, [assignedWorktree]);

        expect(context.worktreeError).toBe('Needs repair');
        expect(actionMatchesContext(action('assigned', { worktree: '2' }), context)).toBe(false);
    });

    it('refreshes a captured context when its assignment becomes available after the worktree list loads', () => {
        const assignedCard = card('F-010', 'design');
        assignedCard.header.worktreeValue = '2';
        assignedCard.header.branch = assignedWorktree.branch;
        const context = cardContext(assignedCard, DEFAULT_CARD_TYPES, []);
        const records = vi.spyOn(worktreeService, 'getRecords').mockReturnValue([]);
        expect(actionMatchesContext(action('current', { worktree: '1' }), context)).toBe(false);

        records.mockReturnValue([assignedWorktree, otherWorktree]);
        const refreshedContext = contextWithCurrentWorktree(context, [assignedWorktree, otherWorktree]);
        expect(refreshedContext.worktree).toBe('1');
        expect(actionMatchesContext(action('current', { worktree: '1' }), context)).toBe(true);
        expect(actionMatchesContext(action('other', { worktree: '2' }), context)).toBe(false);
    });
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
