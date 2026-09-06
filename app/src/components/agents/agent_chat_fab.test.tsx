import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID } from '../../data/action_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { configService } from '../../services/config/config_service'
import { dataService } from '../../services/data/data_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { AgentChatFab } from './agent_chat_fab'

describe('AgentChatFab', () => {
    let actionRunListener: ((event: ActionRunEvent) => void) | null = null
    let projectConversations: AgentConversation[] = []

    beforeEach(() => {
        configService.init()
        actionRunListener = null
        projectConversations = []
        window.md2Actions = {
            onActionRun: vi.fn((listener: (event: ActionRunEvent) => void) => {
                actionRunListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            updateActionConversationViewed: vi.fn(async (_reference: string, viewed: boolean) => ({ viewed })),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockImplementation(async () => projectConversations)
        vi.spyOn(dataService.agents, 'getProjectAgentConversationsSnapshot').mockImplementation(() => projectConversations)
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    })

    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        agentAcknowledgementService.reset()
        delete window.md2Actions
        configService.clear()
        vi.restoreAllMocks()
    })

    it('opens and closes project-wide run form on plain clicks', async () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.click(button)

        expect(screen.getByRole('dialog', { name: 'Run actions for Project' })).toBeInTheDocument()
        expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Conversation history' })).toBeInTheDocument()
        expect(screen.getByLabelText('Conversation chat').compareDocumentPosition(screen.getByLabelText('Prompt')))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(document.querySelector('.MuiModal-root')).not.toBeInTheDocument()

        fireEvent.click(button)

        expect(screen.queryByRole('dialog', { name: 'Run actions for Project' })).not.toBeInTheDocument()
    })

    it('moves without opening popup when pointer gesture crosses drag threshold', () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 })
        fireEvent.pointerMove(button, { clientX: 900, clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(button, { pointerId: 1 })
        fireEvent.click(button)

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '888px', top: '488px' })
        expect(screen.queryByRole('dialog', { name: 'Run actions for Project' })).not.toBeInTheDocument()

        fireEvent.click(button)
        expect(screen.getByRole('dialog', { name: 'Run actions for Project' })).toBeInTheDocument()
    })

    it('detaches the draggable popup while keeping its far corner fixed when resized from the top-left', () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })
        fireEvent.click(button)
        const dialog = screen.getByRole('dialog', { name: 'Run actions for Project' })
        const handle = screen.getByRole('separator', { name: 'Resize action popup from top-left' })
        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(700, 200, 400, 450))

        fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '1128px', top: '728px' })
        expect(dialog.style.width).toBe('450px')
        expect(dialog.style.height).toBe('510px')
        expect(dialog).toHaveStyle({ left: '650px', position: 'fixed', top: '140px' })
    })

    it('shows queued, running, and waiting live states with waiting priority', () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        if (!actionRunListener) throw new Error('Missing action run listener')
        const emit = actionRunListener as (event: ActionRunEvent) => void
        const baseEvent = {
            actionId: CUSTOM_PROMPT_ACTION_ID,
            context: { kind: 'project' as const },
            phase: 'main' as const,
            rootActionId: CUSTOM_PROMPT_ACTION_ID,
            runId: 'project-run',
            type: 'run' as const,
        }

        act(() => emit({ ...baseEvent, status: 'queued' }))
        expect(screen.getByRole('button', { name: 'Project agent — Action is queued' })).toBeInTheDocument()

        act(() => emit({ ...baseEvent, status: 'running' }))
        expect(screen.getByRole('button', { name: 'Project agent — Action is running' })).toBeInTheDocument()
        expect(document.head.textContent).toContain('md2-project-run-spin')

        act(() => emit({ ...baseEvent, status: 'waitingForInput', type: 'agentState' }))
        const waitingButton = screen.getByRole('button', { name: 'Project agent — Agent is waiting for input' })
        expect(waitingButton.querySelector('[data-testid="HelpCircleOutlineIcon"]')).toBeInTheDocument()
    })

    it('shows persisted state priority and clears only displayed unseen project conversation', async () => {
        const unseenConversation: AgentConversation = {
            actionId: CUSTOM_PROMPT_ACTION_ID,
            cardInternalId: null,
            cardPath: null,
            completedAt: '2026-01-01T00:01:00.000Z',
            entries: [],
            hasExplicitTitle: true,
            id: 'unseen-project',
            path: 'design/activity/project.json#conversation=unseen-project',
            providerSessions: [],
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
            title: 'Project result',
            viewed: false,
        }
        const runningConversation = { ...unseenConversation, id: 'running-project', status: 'running' as const, viewed: true }
        const waitingConversation = { ...unseenConversation, id: 'waiting-project', status: 'waitingForInput' as const, viewed: true }
        projectConversations = [unseenConversation, runningConversation, waitingConversation]
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(unseenConversation)
        render(<AgentChatFab />, { wrapper: AppThemeProvider })

        expect(screen.getByRole('button', { name: 'Project agent — Agent is waiting for input' })).toBeInTheDocument()
        projectConversations = [unseenConversation, runningConversation]
        act(() => agentAcknowledgementService.announceConversationsChanged(null, []))
        expect(screen.getByRole('button', { name: 'Project agent — Agent is running' })).toBeInTheDocument()
        projectConversations = [unseenConversation]
        act(() => agentAcknowledgementService.announceConversationsChanged(null, []))
        const button = screen.getByRole('button', { name: 'Project agent — New agent result available' })
        expect(button.querySelector('[data-testid="CircleIcon"]')).toBeInTheDocument()
        fireEvent.click(button)

        const history = await screen.findByRole('combobox', { name: 'Conversation history' })
        fireEvent.mouseDown(history)
        fireEvent.click(await screen.findByRole('option', { name: /Project result/u }))

        await waitFor(() => expect(window.md2Actions?.updateActionConversationViewed)
            .toHaveBeenCalledWith(unseenConversation.path, true))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Project agent' })).toBeInTheDocument())
    })
})
