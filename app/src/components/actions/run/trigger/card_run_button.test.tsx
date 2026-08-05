import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardContext } from '../../../../data/action_context'
import type { ActionRunEvent, ActionRunUpdate, AgentApproval } from '../../../../data/action_run_types'
import type { ActionFile } from '../../../../data/action_types'
import { DEFAULT_CARD_TYPES, type AgentConversation, type AgentConversationEvent, type ProjectCard, type ProjectSnapshot } from '../../../../data/data_types'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { actionService } from '../../../../services/actions/action_service'
import { agentAcknowledgementService } from '../../../../services/agents/agent_acknowledgement_service'
import { cardActionPopupService } from '../../../../services/actions/card_action_popup_service'
import { dataService } from '../../../../services/data/data_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { CardActionPopupHost } from '../popup/card_action_popup_host'
import { CardRunButton } from './card_run_button'

const projectState = vi.hoisted(() => ({ snapshot: null as ProjectSnapshot | null }))

vi.mock('../../../hooks/use_project_state', () => ({
    useProjectState: () => ({
        project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
        runningAgents: [],
        snapshot: projectState.snapshot,
    }),
}))

function conversation(
    status: AgentConversation['status'],
    events: AgentConversationEvent[] = [],
    actionId?: string,
): AgentConversation {
    return {
        actionId,
        cardInternalId: 'f-010',
        cardPath: 'design/F-010.md',
        completedAt: status === 'running' ? null : '2026-01-01T00:01:00.000Z',
        entries: events.map((event) => ({ ...event, kind: 'event' })),
        hasExplicitTitle: true,
        id: 'agent-1',
        path: '.md2-agent-logs/agent-1.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status,
        title: 'Agent',
        viewed: true,
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

const approval: AgentApproval = {
    command: 'npm test',
    filePaths: [],
    itemId: 'command-1',
    kind: 'commandExecution',
    requestId: 41,
    startedAtMs: 1,
    threadId: 'thread-1',
    turnId: 'turn-1',
}

function cardWith(conversations: AgentConversation[]): ProjectCard {
    return { ...card, agentConversations: conversations }
}

function renderCardRunButton(projectCard: ProjectCard = card) {
    projectState.snapshot = {
        activeCards: [projectCard],
        backgroundCards: [],
        repositoryFiles: [],
        workingFolder: 'design',
    }
    render(
        <>
            <CardRunButton
                card={projectCard}
                context={cardContext(projectCard, DEFAULT_CARD_TYPES)}
            />
            <CardActionPopupHost />
        </>,
        { wrapper: AppThemeProvider },
    )
}

describe('CardRunButton', () => {
    beforeEach(() => {
        agentAcknowledgementService.clearRuntimeState()
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            updateActionConversationViewed: vi.fn(async (reference: string, viewed: boolean) => ({
                ...conversation('completed', [], 'implement'),
                path: reference,
                viewed,
            })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([
            file(commandDefinition('branch', { label: 'Create branch' })),
            file(commandDefinition('lint', { description: 'Lint', label: 'Run lint' })),
            file(agentDefinition('implement', {appliesTo: { type: 'feature' }, description: 'Implement', label: 'Implement', onAfter: ['lint'], onBefore: ['branch']})),
        ])
    })

    afterEach(() => {
        actionRunRegistry.stop()
        cardActionPopupService.clear()
        delete window.md2Actions
        cleanup()
        actionService.clear()
        projectState.snapshot = null
        window.localStorage.clear()
        vi.restoreAllMocks()
    })

    it('shows one Run button and toggles the card action popup', () => {
        renderCardRunButton()

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

    it('shows card id in the popup header and accessible title', () => {
        renderCardRunButton()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions for F-010' }))
        expect(within(dialog.getByTestId('action-popup-toolbar')).getByText('F-010')).toBeInTheDocument()
    })

    it('opens the card action popup while an action is running', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (nextListener: (event: ActionRunEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        if (!listener) throw new Error('Missing action run listener')
        const context = cardContext(card, DEFAULT_CARD_TYPES)
        const emit = listener as (event: ActionRunEvent) => void
        act(() => emit({
            actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'run',
        }))
        render(
            <>
                <CardRunButton card={card} context={context} />
                <CardActionPopupHost />
            </>,
            { wrapper: AppThemeProvider },
        )

        const runButton = screen.getByRole('button', { name: 'Run — Action is running' })
        expect(runButton).toBeEnabled()
        fireEvent.click(runButton)

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create branch' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Implement — Agent is running' })).toBeInTheDocument()
    })

    it('prefers live waiting and resumed states over persisted conversation state', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (nextListener: (event: ActionRunEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        if (!listener) throw new Error('Missing action run listener')
        const waitingCard = cardWith([conversation('waitingForInput')])
        const context = cardContext(waitingCard, DEFAULT_CARD_TYPES)
        renderCardRunButton(waitingCard)

        expect(screen.getByRole('button', { name: /Agent is waiting for input/u })).toBeInTheDocument()

        const emit = listener as (event: ActionRunEvent) => void
        act(() => emit({
            actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'run',
        }))
        expect(screen.getByRole('button', { name: /Action is running/u })).toBeInTheDocument()

        act(() => emit({
            actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
            status: 'waitingForInput', type: 'agentState',
        }))
        expect(screen.getByRole('button', { name: /Agent is waiting for input/u })).toBeInTheDocument()

        act(() => emit({
            actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'agentState',
        }))
        expect(screen.getByRole('button', { name: /Action is running/u })).toBeInTheDocument()
    })

    it.each(['agentQuestion', 'agentApproval'] as const)(
        'shows waiting card and popup states for %s updates without agent state events',
        (interactionKind) => {
            let listener: ((event: ActionRunEvent) => void) | null = null
            window.md2Actions = {
                onActionRun: (nextListener: (event: ActionRunEvent) => void) => {
                    listener = nextListener

                    return vi.fn()
                },
                prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            } as unknown as typeof window.md2Actions
            actionRunRegistry.start()
            if (!listener) throw new Error('Missing action run listener')
            const context = cardContext(card, DEFAULT_CARD_TYPES)
            renderCardRunButton()
            const emit = listener as (event: ActionRunEvent) => void
            const interactionUpdate: ActionRunUpdate = interactionKind === 'agentQuestion'
                ? { kind: 'agentQuestion', questions: [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }], requestId: 7 }
                : { approval, kind: 'agentApproval' }

            act(() => {
                emit({
                    actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                    status: 'running', type: 'run',
                })
                emit({
                    actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                    status: 'running', type: 'update', update: { conversation: conversation('running', [], 'implement'), kind: 'agentStarted' },
                })
                emit({
                    actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                    status: 'waitingForInput', type: 'update', update: interactionUpdate,
                })
            })

            const runButton = screen.getByRole('button', { name: /Run.*Agent is waiting for input/u })
            fireEvent.click(runButton)
            expect(within(screen.getByRole('dialog')).getByRole('button', {name: /Implement.*Agent is waiting for input/u})).toBeInTheDocument()

            fireEvent.click(runButton)
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            fireEvent.click(runButton)
            expect(within(screen.getByRole('dialog')).getByRole('button', {name: /Implement.*Agent is waiting for input/u})).toBeInTheDocument()

            const resolvedUpdate: ActionRunUpdate = interactionKind === 'agentQuestion'
                ? {
                    kind: 'agentQuestionAnswer',
                    userMessage: { content: 'Proceed', id: 'message-1', kind: 'message', role: 'user', timestamp: 'later' },
                }
                : { kind: 'agentApprovalResolved', requestId: approval.requestId }
            act(() => emit({
                actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                status: 'running', type: 'update', update: resolvedUpdate,
            }))

            expect(screen.getByRole('button', { name: /Run.*Action is running/u })).toBeInTheDocument()
            expect(within(screen.getByRole('dialog')).getByRole('button', {name: /Implement.*Agent is running/u})).toBeInTheDocument()
        },
    )

    it('keeps the popup anchor mounted when an action starts', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (nextListener: (event: ActionRunEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        if (!listener) throw new Error('Missing action run listener')

        const context = cardContext(card, DEFAULT_CARD_TYPES)
        render(
            <>
                <CardRunButton card={card} context={context} />
                <CardActionPopupHost />
            </>,
            { wrapper: AppThemeProvider },
        )
        const runButton = screen.getByRole('button', { name: 'Run' })
        fireEvent.click(runButton)

        const emit = listener as (event: ActionRunEvent) => void
        act(() => emit({
            actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'run',
        }))

        expect(screen.getByRole('button', { name: 'Run — Action is running' })).toBe(runButton)
        expect(runButton).toBeInTheDocument()
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('keeps a popup open after its card button unmounts', () => {
        const { rerender } = render(
            <AppThemeProvider>
                <CardRunButton card={card} context={cardContext(card, DEFAULT_CARD_TYPES)} />
                <CardActionPopupHost />
            </AppThemeProvider>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        rerender(
            <AppThemeProvider>
                <CardActionPopupHost />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('shows distinct target ids and accessible titles for independent card popups', () => {
        const secondCard = {
            ...card,
            header: { ...card.header, id: 'F-011', internalId: 'f-011', title: 'Second feature' },
            path: 'design/F-011.md',
        }
        projectState.snapshot = {
            activeCards: [card, secondCard],
            backgroundCards: [],
            repositoryFiles: [],
            workingFolder: 'design',
        }
        render(
            <>
                <CardRunButton card={card} context={cardContext(card, DEFAULT_CARD_TYPES)} />
                <CardRunButton card={secondCard} context={cardContext(secondCard, DEFAULT_CARD_TYPES)} />
                <CardActionPopupHost />
            </>,
            { wrapper: AppThemeProvider },
        )

        screen.getAllByRole('button', { name: 'Run' }).forEach((button) => fireEvent.click(button))

        const firstDialog = within(screen.getByRole('dialog', { name: 'Run actions for F-010' }))
        const secondDialog = within(screen.getByRole('dialog', { name: 'Run actions for F-011' }))
        expect(within(firstDialog.getByTestId('action-popup-toolbar')).getByText('F-010')).toBeInTheDocument()
        expect(within(secondDialog.getByTestId('action-popup-toolbar')).getByText('F-011')).toBeInTheDocument()
    })

    it('keeps the active card popup at the front without resetting popup state', () => {
        const secondCard = {
            ...card,
            header: { ...card.header, id: 'F-011', internalId: 'f-011', title: 'Second feature' },
            path: 'design/F-011.md',
        }
        render(
            <>
                <button type="button">Background action</button>
                <CardRunButton card={card} context={cardContext(card, DEFAULT_CARD_TYPES)} />
                <CardRunButton card={secondCard} context={cardContext(secondCard, DEFAULT_CARD_TYPES)} />
                <CardActionPopupHost />
            </>,
            { wrapper: AppThemeProvider },
        )
        const [firstRunButton, secondRunButton] = screen.getAllByRole('button', { name: 'Run' })
        fireEvent.click(firstRunButton)
        const firstDialog = screen.getByRole('dialog')
        fireEvent.click(within(firstDialog).getByRole('button', { name: 'Run lint' }))
        fireEvent.click(secondRunButton)
        const secondDialog = screen.getAllByRole('dialog').find((dialog) => dialog !== firstDialog)
        if (!secondDialog) throw new Error('Missing second card action popup')

        expect(firstDialog.parentElement).toHaveStyle({ zIndex: '1300' })
        expect(secondDialog.parentElement).toHaveStyle({ zIndex: '1301' })
        expect(secondDialog).toHaveFocus()

        fireEvent.pointerDown(firstDialog)

        expect(firstDialog.parentElement).toHaveStyle({ zIndex: '1301' })
        expect(secondDialog.parentElement).toHaveStyle({ zIndex: '1300' })
        expect(screen.getAllByRole('dialog')).toContain(firstDialog)
        expect(within(firstDialog).getByRole('button', { name: 'Run lint' })).toHaveAttribute('aria-pressed', 'true')

        fireEvent.focus(within(secondDialog).getByRole('button', { name: 'Create branch' }))

        expect(firstDialog.parentElement).toHaveStyle({ zIndex: '1300' })
        expect(secondDialog.parentElement).toHaveStyle({ zIndex: '1301' })

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Background action' }))

        expect(firstDialog.parentElement).toHaveStyle({ zIndex: '1300' })
        expect(secondDialog.parentElement).toHaveStyle({ zIndex: '1301' })

        fireEvent.click(within(secondDialog).getByRole('button', { name: 'Close' }))

        expect(screen.getAllByRole('dialog')).toEqual([firstDialog])
        expect(firstDialog.parentElement).toHaveStyle({ zIndex: '1300' })
    })

    it('selects one action at a time inside the Run popup', () => {
        renderCardRunButton()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        fireEvent.click(actionGroup.getByRole('button', { name: 'Run lint' }))

        expect(actionGroup.getByRole('button', { name: 'Run lint' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('loads unseen result and clears its popup LED after display', async () => {
        const completedConversation = { ...conversation('completed', [], 'implement'), viewed: false }
        const projectCard = cardWith([completedConversation])
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([completedConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(completedConversation)
        renderCardRunButton(projectCard)

        fireEvent.click(screen.getByRole('button', { name: 'Run — New agent result available' }))
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))

        fireEvent.click(actionGroup.getByRole('button', { name: 'Implement — New agent result available' }))

        await waitFor(() => expect(actionGroup.getByRole('button', { name: 'Implement' })).toBeInTheDocument())
        expect(dataService.loadAgentConversation).toHaveBeenCalledWith(completedConversation.path)
        expect(actionGroup.getByRole('button', { name: 'Run lint' })).toBeInTheDocument()
    })

    it('shows custom-action save controls from the Run popup', async () => {
        renderCardRunButton()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const dialog = within(screen.getByRole('dialog'))
        fireEvent.click(dialog.getByRole('button', { name: 'Add action' }))

        expect(await dialog.findByLabelText('Prompt')).toBeInTheDocument()
        expect(dialog.getByLabelText('Preset name')).toHaveFocus()
        expect(dialog.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('shows the plain Run button when the agent is idle', () => {
        renderCardRunButton()

        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('distinguishes waiting, running, unseen and acknowledged agent states', async () => {
        window.localStorage.clear()
        const waiting = conversation('running', [{ content: '', id: 'wait', timestamp: '2026-01-01T00:00:30.000Z', type: 'waiting' }])
        const { rerender } = render(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([waiting])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                />
                <CardActionPopupHost />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run — Agent is waiting for input' })).toBeInTheDocument()

        rerender(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([conversation('running', [
                        { content: '', id: 'wait', timestamp: '2026-01-01T00:00:20.000Z', type: 'waiting' },
                        { content: '', id: 'resume', timestamp: '2026-01-01T00:00:30.000Z', type: 'resumed' },
                    ])])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                />
                <CardActionPopupHost />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run — Agent is running' })).toBeInTheDocument()

        const completed = { ...conversation('completed'), viewed: false }
        rerender(
            <AppThemeProvider>
                <CardRunButton
                    card={cardWith([completed])}
                    context={cardContext(card, DEFAULT_CARD_TYPES)}
                />
                <CardActionPopupHost />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Run — New agent result available' })).toBeInTheDocument()

        await act(() => agentAcknowledgementService.setViewed(card.path, 'implement', completed, true))

        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })
})
