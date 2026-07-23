import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard, ProjectSnapshot } from '../../data/data_types'
import {
    CARD_ADDED_EVENT,
    CARD_CHANGED_EVENT,
    type DataService,
} from '../../services/data/data_service'
import { useCardColumnCards } from './use_card_column_cards'
import { useCardViewColumns } from './use_card_view_columns'
import { useProjectCard } from './use_project_card'

function card(path: string, status: string, title: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status, title,
        },
        headerFields: {},
        isActive: true,
        path,
    }
}

function createService(initialCards: ProjectCard[]) {
    const service = new EventTarget() as DataService
    let snapshot: ProjectSnapshot = {
        activeCards: initialCards,
        backgroundCards: [],
        repositoryFiles: [],
        workingFolder: 'design',
    }
    service.getState = () => ({ project: null, runningAgents: [], snapshot })

    return {
        emit(eventName: string, cards: ProjectCard[]) {
            const previousCards = snapshot.activeCards
            snapshot = { ...snapshot, activeCards: cards }
            const card = eventName === CARD_ADDED_EVENT
                ? cards.find((candidate) => !previousCards.some(({ path }) => path === candidate.path))
                : cards[0]
            if (!card) throw new Error(`Missing card for ${eventName}`)
            const previousCard = previousCards.find(({ path }) => path === card.path)
            const detail = previousCard ? { card, previousCard } : { card }
            service.dispatchEvent(new CustomEvent(eventName, { detail }))
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

    it('rerenders card only for meaningful card-view data changes', () => {
        const firstCard = card('design/F-1.md', 'todo', 'First')
        const { emit, service } = createService([firstCard])
        const rendered = vi.fn()
        function TestCard() {
            rendered(useProjectCard(firstCard.path, service)?.header.title)

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
})
