import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { CardOpenDocument } from '../../services/open_files_service'
import { useActiveCard } from './use_active_card'

function card(title: string): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', headerFields: {}, isActive: true,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'card-1',
            owner: null, policy: {}, status: 'ready', title, worktree: null, worktreeError: null, worktreeValue: null,
        },
        path: 'design/F-1.md',
    }
}

function sourceWithCard(initialCard: ProjectCard) {
    let snapshot: ProjectSnapshot = {activeCards: [initialCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design'}
    let documentCard = initialCard
    const dataSource = new CardMarkdownDataSource()
    const owner = Object.assign(new EventTarget(), {
        cards: {toggleCardPolicy: vi.fn(), updateCardBody: vi.fn(), updateCardHeaderFields: vi.fn(), updateCardTitle: vi.fn()},
        getState: () => ({ branch: 'main', project: { branch: 'main', id: 'project' }, runningAgents: [], snapshot }),
        renew: (nextCard: ProjectCard) => {
            snapshot = { ...snapshot, activeCards: [nextCard] }
            documentCard = nextCard
            owner.dispatchEvent(new Event('changed'))
            dataSource.dispatchEvent(new Event('cardsChanged'))
        },
    })
    dataSource.init(owner)
    const document = Object.assign(new EventTarget(), {getDraft: () => documentCard, kind: 'card' as const}) as CardOpenDocument
    dataSource.setActiveTarget('list-card', { document })

    return { dataSource, owner }
}

function ActiveCardTitle(props: { dataSource: CardMarkdownDataSource }) {
    const cardSnapshot = useActiveCard('list-card', props.dataSource)

    return <span>{cardSnapshot?.header.title ?? 'None'}</span>
}

afterEach(cleanup)

describe('useActiveCard', () => {
    it('rerenders when the bound card metadata changes', () => {
        const { dataSource, owner } = sourceWithCard(card('Alpha'))
        render(<ActiveCardTitle dataSource={dataSource} />)

        act(() => owner.renew(card('Beta')))

        expect(screen.getByText('Beta')).toBeInTheDocument()
    })

    it('renders no card after its binding clears', () => {
        const { dataSource } = sourceWithCard(card('Alpha'))
        render(<ActiveCardTitle dataSource={dataSource} />)

        act(() => dataSource.setActiveTarget('list-card', null))

        expect(screen.getByText('None')).toBeInTheDocument()
    })
})
