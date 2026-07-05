import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { DEFAULT_CARD_TYPES, type AgentConversation, type ProjectCard } from '../../data/data_types'

function conversation(): AgentConversation {
    return {
        cardPath: 'design/F-1.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        events: [],
        id: 'agent-1',
        messages: [{ content: 'completed output', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Implementation agent',
    }
}

function card(id: string, title: string, status: string, policy: Record<string, string> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}\n\nBody of ${id}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy, status, title,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [
    card('F-1', 'First', 'todo', { checkLinting: 'true', requireTests: 'false' }),
    card('F-2', 'Second', 'done'),
]

function renderCardView(overrides: Partial<Parameters<typeof CardView>[0]> = {}) {
    const handlers = {
        onBodyChange: vi.fn(),
        onContinueAgentConversation: vi.fn(),
        onMoveCard: vi.fn(),
        onOpenInFileMode: vi.fn(),
        onTitleChange: vi.fn(),
        onTogglePolicy: vi.fn(),
    }

    render(
        <CardView
            cardTypes={DEFAULT_CARD_TYPES}
            cards={cards}
            isMobile={false}
            selectedPath={null}
            {...handlers}
            {...overrides}
        />,
    )

    return handlers
}

describe('CardView', () => {
    afterEach(cleanup)

    it('groups cards into a column per status with id and title', () => {
        renderCardView()

        expect(screen.getByText('todo')).toBeInTheDocument()
        expect(screen.getByText('done')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getByText('First')).toBeInTheDocument()
    })

    it('renders one policy led per policy flag and toggles on click', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Toggle checkLinting' }))

        expect(handlers.onTogglePolicy).toHaveBeenCalledWith('design/F-1.md', 'checkLinting')
    })

    it('edits the title inline on double-click and commits on Enter', () => {
        const handlers = renderCardView()

        fireEvent.doubleClick(screen.getByText('First'))
        const input = screen.getByDisplayValue('First')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(handlers.onTitleChange).toHaveBeenCalledWith('design/F-1.md', 'Renamed')
    })

    it('opens the body in a dialog on desktop when a card is clicked', () => {
        renderCardView()

        fireEvent.click(screen.getByText('First'))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('F-1 First')).toBeInTheDocument()
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
    })

    it('routes the file-mode action from the dialog to the callback', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByText('First'))
        fireEvent.click(screen.getByRole('button', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('expands the body inline as an accordion on mobile instead of a dialog', () => {
        renderCardView({ isMobile: true })

        fireEvent.click(screen.getByText('First'))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
    })

    it('highlights the card matching the selected path', () => {
        const { container } = render(
            <CardView
                cardTypes={DEFAULT_CARD_TYPES}
                cards={cards}
                isMobile={false}
                onBodyChange={vi.fn()}
                onContinueAgentConversation={vi.fn()}
                onMoveCard={vi.fn()}
                onOpenInFileMode={vi.fn()}
                onTitleChange={vi.fn()}
                onTogglePolicy={vi.fn()}
                selectedPath="design/F-2.md"
            />,
        )

        const selected = container.querySelectorAll('[data-selected="true"]')
        expect(selected).toHaveLength(1)
        expect(within(selected[0] as HTMLElement).getByText('Second')).toBeInTheDocument()
    })

    it('shows agent conversations from the card led and continues them', () => {
        const agentConversation = conversation()
        const cardWithConversation = { ...cards[0], agentConversations: [agentConversation] }
        const handlers = renderCardView({ cards: [cardWithConversation] })

        fireEvent.click(screen.getByRole('button', { name: 'Agent conversations for F-1' }))
        expect(screen.getByText('Implementation agent')).toBeInTheDocument()
        expect(screen.getByText('completed output')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(handlers.onContinueAgentConversation).toHaveBeenCalledWith('design/F-1.md', agentConversation)
    })
})
