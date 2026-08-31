import { describe, expect, it } from 'vitest'
import { buildCardColumns, computeMove, deriveStatesFromCards, groupByStatus, mergeStatesWithDefaults, orderByAfter } from './card_ordering'
import { defaultColumnAccent, type Card } from './data_types'

function card(internalId: string, options: { after?: string | null; status?: string } = {}): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: options.after ?? null,
            agentLogReferences: [],
            changedFiles: [],
            author: null,
            id: internalId.toUpperCase(),
            internalId,
            owner: null,
            policy: {},
            references: [],
            status: options.status ?? 'active',
            title: internalId,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${internalId}.md`,
    }
}

function paths(cards: Card[]) {
    return cards.map((entry) => entry.header.internalId)
}

describe('orderByAfter', () => {
    it('orders cards by their after chain regardless of input order', () => {
        const cards = [card('c', { after: 'b' }), card('a'), card('d', { after: 'c' }), card('b', { after: 'a' })]

        expect(paths(orderByAfter(cards))).toEqual(['a', 'b', 'c', 'd'])
    })

    it('keeps heads in input order and appends cards left over by cycles', () => {
        const cards = [card('x', { after: 'y' }), card('y', { after: 'x' }), card('a')]

        expect(paths(orderByAfter(cards))).toEqual(['a', 'x', 'y'])
    })
})

describe('groupByStatus', () => {
    it('creates one ordered column per distinct status in first-seen order', () => {
        const cards = [
            card('b', { after: 'a', status: 'todo' }),
            card('p', { status: 'done' }),
            card('a', { status: 'todo' }),
        ]
        const columns = groupByStatus(cards)

        expect(columns.map((column) => column.status)).toEqual(['todo', 'done'])
        expect(paths(columns[0].cards)).toEqual(['a', 'b'])
        expect(paths(columns[1].cards)).toEqual(['p'])
    })
})

describe('buildCardColumns', () => {
    it('uses config order and hides empty states unless always visible', () => {
        const cards = [card('a', { status: 'in progress' }), card('b', { status: 'done' })]
        const states = [
            { alwaysVisible: true, color: '#111111', state: 'new' },
            { alwaysVisible: false, color: '#222222', state: 'done' },
            { alwaysVisible: false, state: 'design' },
            { alwaysVisible: true, color: '#444444', state: 'in progress' },
        ]

        const columns = buildCardColumns(cards, states)

        expect(columns.map((column) => column.status)).toEqual(['new', 'done', 'in progress'])
        expect(columns.map((column) => column.color)).toEqual(['#111111', '#222222', '#444444'])
        expect(columns.map((column) => paths(column.cards))).toEqual([[], ['b'], ['a']])
    })

    it('does not create columns for card states absent from config', () => {
        expect(buildCardColumns([card('a', { status: 'unsupported' })], [
            { alwaysVisible: true, state: 'new' },
        ])).toEqual([{ cards: [], color: defaultColumnAccent(0), status: 'new' }])
    })
})

describe('deriveStatesFromCards', () => {
    it('derives distinct non-empty states in first-seen order as non-persistent columns', () => {
        const cards = [
            card('a', { status: 'design' }),
            card('b', { status: 'ready' }),
            card('c', { status: 'design' }),
        ]

        expect(deriveStatesFromCards(cards)).toEqual([
            { alwaysVisible: false, color: defaultColumnAccent(0), state: 'design' },
            { alwaysVisible: false, color: defaultColumnAccent(1), state: 'ready' },
        ])
    })
})

describe('mergeStatesWithDefaults', () => {
    it('keeps discovered order, uses matching default definitions and appends missing defaults', () => {
        const states = [
            { alwaysVisible: false, state: 'custom' },
            { alwaysVisible: false, state: 'design' },
        ]

        expect(mergeStatesWithDefaults(states)).toEqual([
            { alwaysVisible: false, color: defaultColumnAccent(0), state: 'custom' },
            { alwaysVisible: true, color: defaultColumnAccent(1), state: 'design' },
            { alwaysVisible: true, color: defaultColumnAccent(0), state: 'new' },
            { alwaysVisible: true, color: defaultColumnAccent(2), state: 'ready for implementation' },
            { alwaysVisible: true, color: defaultColumnAccent(3), state: 'to fix' },
            { alwaysVisible: true, color: defaultColumnAccent(4), state: 'ready' },
        ])
    })
})

describe('computeMove', () => {
    const column = [
        card('a'),
        card('b', { after: 'a' }),
        card('c', { after: 'b' }),
        card('d', { after: 'c' }),
    ]

    it('reorders within a column touching only the affected cards', () => {
        const updates = computeMove(column, 'design/c.md', 'active', 0)

        expect(updates).toHaveLength(3)
        expect(updates).toContainEqual({ after: null, path: 'design/c.md', status: 'active' })
        expect(updates).toContainEqual({ after: 'c', path: 'design/a.md', status: 'active' })
        expect(updates).toContainEqual({ after: 'b', path: 'design/d.md', status: 'active' })
    })

    it('repairs multiple heads when moving a card to first place', () => {
        const cards = [card('a'), card('b'), card('c'), card('d')]
        const updates = computeMove(cards, 'design/d.md', 'active', 0)
        const updatesByPath = new Map(updates.map((update) => [update.path, update]))
        const updatedCards = cards.map((currentCard) => {
            const update = updatesByPath.get(currentCard.path)
            if (!update) return currentCard

            return { ...currentCard, header: { ...currentCard.header, after: update.after, status: update.status } }
        })

        expect(paths(orderByAfter(updatedCards))).toEqual(['d', 'a', 'b', 'c'])
        expect(updates).toEqual([
            { after: 'd', path: 'design/a.md', status: 'active' },
            { after: 'a', path: 'design/b.md', status: 'active' },
            { after: 'b', path: 'design/c.md', status: 'active' },
        ])
    })

    it('moves a card to the end of its column with a minimal write set', () => {
        const updates = computeMove(column, 'design/b.md', 'active', 3)

        expect(updates).toHaveLength(2)
        expect(updates).toContainEqual({ after: 'd', path: 'design/b.md', status: 'active' })
        expect(updates).toContainEqual({ after: 'a', path: 'design/c.md', status: 'active' })
    })

    it('changes status and relinks both columns when moving across columns', () => {
        const cards = [
            card('a', { status: 'todo' }),
            card('b', { after: 'a', status: 'todo' }),
            card('c', { after: 'b', status: 'todo' }),
            card('p', { status: 'done' }),
            card('q', { after: 'p', status: 'done' }),
        ]
        const updates = computeMove(cards, 'design/b.md', 'done', 1)

        expect(updates).toHaveLength(3)
        expect(updates).toContainEqual({ after: 'p', path: 'design/b.md', status: 'done' })
        expect(updates).toContainEqual({ after: 'b', path: 'design/q.md', status: 'done' })
        expect(updates).toContainEqual({ after: 'a', path: 'design/c.md', status: 'todo' })
    })

    it('returns no updates for a no-op move', () => {
        expect(computeMove(column, 'design/b.md', 'active', 1)).toEqual([])
    })

    it('returns no updates when the card is not found', () => {
        expect(computeMove(column, 'design/missing.md', 'active', 0)).toEqual([])
    })
})
