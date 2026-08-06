import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card, ProjectSnapshot } from '../../data/data_types'
import {
    CARD_ADDED_EVENT,
    CARD_CHANGED_EVENT,
    cardCollectionFieldChangedEvent,
    cardFieldChangedEvent,
    type DataService,
} from '../../services/data/data_service'
import { useCardColumnCards } from './use_card_column_cards'
import { useCardViewColumns } from './use_card_view_columns'
import { useCardBody, useCardConversations, useCardMetadata, useCardTitle, useCardWorktree } from './use_project_card'
import { CardWorktreeIndicator } from './card_worktree_indicator'

const worktreeSelectorRendered = vi.hoisted(() => vi.fn())

vi.mock('../worktree_selector', () => ({
    WorktreeSelector: (props: unknown) => {
        worktreeSelectorRendered(props)

        return null
    },
}))

function card(path: string, status: string, title: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status, title,
        },
        hasFrontmatter:true,
        isActive: true,
        path,
    }
}

function createService(initialCards: Card[]) {
    const service = new EventTarget() as DataService
    let snapshot: ProjectSnapshot = {
        activeCards: initialCards,
        backgroundCards: [],
        repositoryFiles: [],
        workingFolder: 'design',
    }
    service.getState = () => ({ project: null, runningAgents: [], snapshot })

    return {
        emit(eventName: string, cards: Card[]) {
            const previousCards = snapshot.activeCards
            snapshot = { ...snapshot, activeCards: cards }
            const card = eventName === CARD_ADDED_EVENT
                ? cards.find((candidate) => !previousCards.some(({ path }) => path === candidate.path))
                : cards[0]
            if (!card) throw new Error(`Missing card for ${eventName}`)
            const previousCard = previousCards.find(({ path }) => path === card.path)
            const detail = previousCard ? { card, previousCard } : { card }
            service.dispatchEvent(new CustomEvent(eventName, { detail }))
            if (!previousCard) return
            if (previousCard.content !== card.content) service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'body')))
            if (previousCard.header.title !== card.header.title) service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'title')))
            if (previousCard.header.status !== card.header.status || previousCard.header.after !== card.header.after) {
                service.dispatchEvent(new Event(cardCollectionFieldChangedEvent('ordering')))
            }
            if (previousCard.header.status !== card.header.status) {
                service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'status')))
                service.dispatchEvent(new Event(cardCollectionFieldChangedEvent('status')))
            }
            if (previousCard.header.worktree !== card.header.worktree) service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'worktree')))
            if (previousCard.agentConversations !== card.agentConversations) service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'conversation')))
        },
        service,
    }
}

afterEach(cleanup)

describe('card view subscriptions', () => {
    it('rerenders board only when visible columns change', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])
        const rendered = vi.fn()
        function TestView() {
            const columns = useCardViewColumns([
                { alwaysVisible: false, state: 'todo' },
                { alwaysVisible: false, state: 'done' },
            ], service)
            rendered(columns.map(({ status }) => status))

            return null
        }
        render(<TestView />)
        const initialRenderCount = rendered.mock.calls.length

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, content: '# Edited' }]))
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount)

        act(() => emit(CARD_ADDED_EVENT, [firstCard, card('design/F-2.md', 'done', 'Second')]))
        expect(rendered).toHaveBeenLastCalledWith(['todo', 'done'])
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount + 1)
    })

    it('rerenders column only when ordered membership changes', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])
        const rendered = vi.fn()
        function TestColumn() {
            rendered(useCardColumnCards('todo', service))

            return null
        }
        render(<TestColumn />)
        const initialRenderCount = rendered.mock.calls.length

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, header: { ...firstCard.header, title: 'Renamed' } }]))
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount)

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, header: { ...firstCard.header, status: 'done' } }]))
        expect(rendered).toHaveBeenLastCalledWith([])
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount + 1)
    })

    it('rerenders title leaf only for title changes', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])
        const rendered = vi.fn()
        function TestCard() {
            rendered(useCardTitle(firstCard.path, service))

            return null
        }
        render(<TestCard />)
        const initialRenderCount = rendered.mock.calls.length

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, content: '# Edited body' }]))
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount)

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, header: { ...firstCard.header, title: 'Renamed' } }]))
        expect(rendered).toHaveBeenLastCalledWith('Renamed')
        expect(rendered).toHaveBeenCalledTimes(initialRenderCount + 1)
    })

    it('does not serialize card data when reading the card view', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const serializeConversations = vi.fn(() => {
            throw new Error('Card conversations must not be serialized')
        })
        Object.defineProperty(firstCard.agentConversations, 'toJSON', { value: serializeConversations })
        const { service } = createService([firstCard])

        function TestCard() {
            useCardMetadata(firstCard.path, service)

            return null
        }

        render(<TestCard />)

        expect(serializeConversations).not.toHaveBeenCalled()
    })

    it('rerenders only leaf subscribed to changed field', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])
        const titleRendered = vi.fn()
        const bodyRendered = vi.fn()
        const worktreeRendered = vi.fn()
        const conversationRendered = vi.fn()
        function TitleLeaf() { titleRendered(useCardTitle(firstCard.path, service)); return null }
        function BodyLeaf() { bodyRendered(useCardBody(firstCard.path, service)); return null }
        function WorktreeLeaf() { worktreeRendered(useCardWorktree(firstCard.path, service)); return null }
        function ConversationLeaf() { conversationRendered(useCardConversations(firstCard.path, service)); return null }

        render(<><TitleLeaf /><BodyLeaf /><WorktreeLeaf /><ConversationLeaf /></>)
        const initialCounts = {
            body: bodyRendered.mock.calls.length,
            conversation: conversationRendered.mock.calls.length,
            title: titleRendered.mock.calls.length,
            worktree: worktreeRendered.mock.calls.length,
        }

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, header: { ...firstCard.header, title: 'Renamed' } }]))

        expect(titleRendered).toHaveBeenCalledTimes(initialCounts.title + 1)
        expect(bodyRendered).toHaveBeenCalledTimes(initialCounts.body)
        expect(worktreeRendered).toHaveBeenCalledTimes(initialCounts.worktree)
        expect(conversationRendered).toHaveBeenCalledTimes(initialCounts.conversation)
    })

    it('does not rerender actual worktree leaf for body or title changes', () => {
        worktreeSelectorRendered.mockClear()
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])

        render(<CardWorktreeIndicator cardId="F-1" cardPath={firstCard.path} primaryPath="project" service={service} />)
        const initialRenderCount = worktreeSelectorRendered.mock.calls.length

        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, content: '# Edited body' }]))
        act(() => emit(CARD_CHANGED_EVENT, [{ ...firstCard, header: { ...firstCard.header, title: 'Renamed' } }]))

        expect(worktreeSelectorRendered).toHaveBeenCalledTimes(initialRenderCount)
    })
})
