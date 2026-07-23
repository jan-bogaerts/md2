import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardContext } from '../../data/action_context'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type AgentConversation, type ProjectCard } from '../../data/data_types'
import { actionExecutionService } from '../../services/actions/action_execution_service'
import { actionService } from '../../services/actions/action_service'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardRunButton } from './card_run_button'

const PROJECT_KEY = 'project:main'

function conversation(
    status: AgentConversation['status'],
    events: AgentConversation['events'] = [],
    actionId?: string,
): AgentConversation {
    return {
        actionId,
        cardPath: 'design/F-010.md',
        completedAt: status === 'running' ? null : '2026-01-01T00:01:00.000Z',
        events,
        hasExplicitTitle: true,
        id: 'agent-1',
        messages: [],
        path: '.md2-agent-logs/agent-1.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status,
        title: 'Agent',
    }
}

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 't', description: id, id, label: id, type: 'command', ...overrides }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: id, id, label: id, prompt: 't', type: 'agent', ...overrides }
}

const card: ProjectCard = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '',
    headerFields: {},
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-010', internalId: 'f-010', owner: null,
        policy: {}, status: 'design', title: 'Feature',
    },
    isActive: true,
    path: 'design/F-010.md',
}

function cardWith(conversations: AgentConversation[]): ProjectCard {
    return { ...card, agentConversations: conversations }
}

function renderCardRunButton(onConversationViewed: () => void, projectCard: ProjectCard = card) {
    render(
        <CardRunButton
            card={projectCard}
            context={cardContext(projectCard, DEFAULT_CARD_TYPES)}
            onConversationViewed={onConversationViewed}
            projectKey={PROJECT_KEY}
        />,
        { wrapper: AppThemeProvider },
    )
}

describe('CardRunButton', () => {
    const onConversationViewed = vi.fn()

    beforeEach(() => {
        window.md2Actions = {
            onActionExecution: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([
            file(commandDefinition('branch', { label: 'Create branch' })),
            file(commandDefinition('lint', { description: 'Lint', label: 'Run lint' })),
            file(agentDefinition('implement', {appliesTo: { type: 'feature' }, description: 'Implement', label: 'Implement', onAfter: ['lint'], onBefore: ['branch']})),
        ])
    })

    afterEach(() => {
        actionExecutionService.stop()
        delete window.md2Actions
        cleanup()
        actionService.clear()
        window.localStorage.clear()
        vi.restoreAllMocks()
    })

    it('shows one Run button and toggles the card action popup', () => {
        renderCardRunButton(onConversationViewed)

        const runButton = screen.getByRole('button', { name: 'Run' })
        fireEvent.click(runButton)

        const dialog = within(screen.getByRole('dialog'))
        const actionGroup = within(dialog.getByRole('group', { name: 'Actions' }))
        const actionButtons = actionGroup.getAllByRole('button')
        expect(actionButtons.map((button) => button.textContent)).toEqual(['Create branch', 'Run lint', 'Implement', 'Custom prompt'])
        expect(dialog.getByRole('button', { name: 'Create branch' })).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(runButton)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens the card action popup while an action is running', () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (nextListener: (event: ActionExecutionEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        actionExecutionService.start()
        if (!listener) throw new Error('Missing action execution listener')
        const context = cardContext(card, DEFAULT_CARD_TYPES)
        const emit = listener as (event: ActionExecutionEvent) => void
        act(() => emit({
            actionId: 'implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'execution',
        }))
        render(
            <CardRunButton card={card} context={context} onConversationViewed={onConversationViewed} projectKey={PROJECT_KEY} />,
            { wrapper: AppThemeProvider },
        )

        const runButton = screen.getByRole('button', { name: 'Run — Action is running' })
        expect(runButton).toBeEnabled()
        fireEvent.click(runButton)

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create branch' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Implement — Agent is running' })).toBeInTheDocument()
    })

    it('keeps the popup anchor mounted when an action starts', () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (nextListener: (event: ActionExecutionEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        actionExecutionService.start()
        if (!listener) throw new Error('Missing action execution listener')

        const context = cardContext(card, DEFAULT_CARD_TYPES)
        render(
            <CardRunButton card={card} context={context} onConversationViewed={onConversationViewed} projectKey={PROJECT_KEY} />,
            { wrapper: AppThemeProvider },
        )
        const runButton = screen.getByRole('button', { name: 'Run' })
        fireEvent.click(runButton)

        const emit = listener as (event: ActionExecutionEvent) => void
        act(() => emit({
            actionId: 'implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'execution',
        }))

        expect(screen.getByRole('button', { name: 'Run — Action is running' })).toBe(runButton)
        expect(runButton).toBeInTheDocument()
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('selects one action at a time inside the Run popup', () => {
        renderCardRunButton(onConversationViewed)

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        fireEvent.click(actionGroup.getByRole('button', { name: 'Run lint' }))

        expect(actionGroup.getByRole('button', { name: 'Run lint' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('marks actions with unseen agent results inside the Run popup', () => {
        renderCardRunButton(onConversationViewed, cardWith([conversation('completed', [], 'implement')]))

        fireEvent.click(screen.getByRole('button', { name: 'Run — New agent result available' }))
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))

        expect(actionGroup.getByRole('button', { name: 'Implement — New agent result available' })).toBeInTheDocument()
        expect(actionGroup.getByRole('button', { name: 'Run lint' })).toBeInTheDocument()
    })

    it('shows custom-action save controls from the Run popup', async () => {
        renderCardRunButton(onConversationViewed)

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const dialog = within(screen.getByRole('dialog'))
        fireEvent.click(dialog.getByRole('button', { name: 'Add action' }))

        expect(await dialog.findByLabelText('Prompt')).toBeInTheDocument()
        expect(dialog.getByLabelText('Preset name')).toHaveFocus()
        expect(dialog.getByRole('button', { name: 'Run' })).toBeDisabled()
    })

    it('shows the plain Run button when the agent is idle', () => {
        renderCardRunButton(onConversationViewed)

        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('distinguishes waiting, running, unseen and acknowledged agent states', () => {
        window.localStorage.clear()
        const waiting = conversation('running', [{ content: '', id: 'wait', timestamp: '2026-01-01T00:00:30.000Z', type: 'waiting' }])
        const { rerender } = render(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([waiting])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                    onConversationViewed={onConversationViewed}
                    projectKey={PROJECT_KEY}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run — Agent is waiting for input' })).toBeInTheDocument()

        rerender(<AppThemeProvider><CardRunButton card={cardWith([conversation('running')])} context={cardContext(card, DEFAULT_CARD_TYPES)} onConversationViewed={onConversationViewed} projectKey={PROJECT_KEY} /></AppThemeProvider>)
        expect(screen.getByRole('button', { name: 'Run — Agent is running' })).toBeInTheDocument()

        const completed = conversation('completed')
        rerender(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([completed])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                    onConversationViewed={onConversationViewed}
                    projectKey={PROJECT_KEY}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run — New agent result available' })).toBeInTheDocument()

        agentAcknowledgementService.acknowledge(PROJECT_KEY, card.path, [completed])
        rerender(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([completed])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                    onConversationViewed={onConversationViewed}
                    projectKey={PROJECT_KEY}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })
})
