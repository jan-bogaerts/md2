import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { actionService } from '../../services/action_service'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type AgentConversation, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { AppThemeProvider } from '../../theme/theme_provider'

function conversation(): AgentConversation {
    return {
        cardPath: 'design/F-1.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        continuedFrom: null,
        events: [],
        id: 'agent-1',
        messages: [{ content: 'completed output', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        nativeSessionId: null,
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
        headerFields: {},
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

function actionFile(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

function renderCardView(overrides: Partial<Parameters<typeof CardView>[0]> = {}) {
    const handlers = {
        onAffectsChange: vi.fn(),
        onBodyChange: vi.fn(),
        onContinueAgentConversation: vi.fn(),
        onDeleteCard: vi.fn(async () => undefined),
        onMoveCard: vi.fn(),
        onOpenInFileMode: vi.fn(),
        onSendAgentInput: vi.fn(),
        onStartAgentConversation: vi.fn(),
        onTitleChange: vi.fn(),
        onTogglePolicy: vi.fn(),
    }

    render(
        <AppThemeProvider>
            <CardView
                cardTypes={DEFAULT_CARD_TYPES}
                cards={cards}
                isMobile={false}
                repositoryFiles={['app/src/app.tsx', 'design/F-1.md']}
                selectedPath={null}
                {...handlers}
                {...overrides}
            />
        </AppThemeProvider>,
    )

    return handlers
}

describe('CardView', () => {
    afterEach(() => {
        cleanup()
        actionService.clear()
    })

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
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        renderCardView()

        fireEvent.click(screen.getByText('First'))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('F-1 First')).toBeInTheDocument()
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('routes the file-mode action from the dialog to the callback', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByText('First'))
        fireEvent.click(screen.getByRole('button', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('confirms before deleting from the card actions menu', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('design/F-1.md'))
        expect(handlers.onDeleteCard).toHaveBeenCalledWith('design/F-1.md')

        confirm.mockRestore()
    })

    it('does not delete from the card actions menu when confirmation is cancelled', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

        expect(handlers.onDeleteCard).not.toHaveBeenCalled()

        confirm.mockRestore()
    })

    it('opens matching actions from the card context menu', () => {
        actionService.loadFromFiles([
            actionFile({
                appliesTo: { type: 'feature' },
                description: 'Implement',
                label: 'Implement',
                name: 'implement',
                text: 't',
                type: 'agent',
            }),
        ])
        renderCardView()

        fireEvent.contextMenu(screen.getByText('First'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Implement' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Implement' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('opens existing card commands from the icon button menu', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('confirms before deleting from the body dialog', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const handlers = renderCardView()

        fireEvent.click(screen.getByText('First'))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('design/F-1.md'))
        expect(handlers.onDeleteCard).toHaveBeenCalledWith('design/F-1.md')

        confirm.mockRestore()
    })

    it('expands the body inline as an accordion on mobile instead of a dialog', () => {
        renderCardView({ isMobile: true })

        fireEvent.click(screen.getByText('First'))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
    })

    it('highlights the card matching the selected path', () => {
        const { container } = render(
            <AppThemeProvider>
                <CardView
                    cardTypes={DEFAULT_CARD_TYPES}
                    cards={cards}
                    isMobile={false}
                    onAffectsChange={vi.fn()}
                    onBodyChange={vi.fn()}
                    onContinueAgentConversation={vi.fn()}
                    onDeleteCard={vi.fn(async () => undefined)}
                    onMoveCard={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    onSendAgentInput={vi.fn()}
                    onStartAgentConversation={vi.fn()}
                    onTitleChange={vi.fn()}
                    onTogglePolicy={vi.fn()}
                    repositoryFiles={[]}
                    selectedPath="design/F-2.md"
                />
            </AppThemeProvider>,
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

    it('starts a new agent conversation from the card popover', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Agent conversations for F-1' }))
        fireEvent.change(screen.getByLabelText('Agent prompt'), { target: { value: 'implement this card' } })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))

        expect(handlers.onStartAgentConversation).toHaveBeenCalledWith('design/F-1.md', 'implement this card')
    })

    it('saves affects changes from the card dialog', () => {
        const handlers = renderCardView({ repositoryFiles: ['app/src/app.tsx', 'design/F-1.md'] })

        fireEvent.click(screen.getAllByRole('button', { name: 'Affects' })[0])
        fireEvent.change(screen.getByRole('combobox', { name: 'Add affected file' }), { target: { value: 'app/src/app.tsx' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(handlers.onAffectsChange).toHaveBeenCalledWith('design/F-1.md', ['app/src/app.tsx'])
    })
})
