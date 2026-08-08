import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { agentCapabilitiesService } from '../../../../services/agents/agent_capabilities_service'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionConversationStore } from '../../conversation/action_conversation_store'
import { ActionHistoryStore } from '../state/action_history_store'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { ActionUsageScopeStore } from './action_usage_scope_store'
import { ActionRunInputStore } from '../state/action_run_input_store'
import { ActionRunResultStore } from '../state/action_run_result_store'
import { ActionScheduleStore } from '../schedule/action_schedule_store'

const context = { kind: 'project' as const }
const action = {
    description: 'Custom prompt',
    id: CUSTOM_PROMPT_ACTION_ID,
    label: 'Custom prompt',
    phrases: [],
    prompt: '',
    type: 'agent',
} as unknown as ActionDefinition

function waitingConversation(actionId: string): AgentConversation {
    return {
        actionId,
        cardInternalId: null,
        cardPath: null,
        completedAt: null,
        entries: [],
        hasExplicitTitle: true,
        id: `${actionId}-conversation`,
        path: `design/activity/project.json#conversation=${actionId}`,
        providerSessions: [],
        startedAt: '2026-08-04T10:00:00.000Z',
        status: 'waitingForInput',
        title: 'Waiting conversation',
        viewed: true,
    }
}

function renderBottomRow(actionOverride = action, conversationStore = new ActionConversationStore(actionOverride.id, context)) {
    const historyStore = new ActionHistoryStore(actionOverride, context)
    const inputStore = new ActionRunInputStore()
    const resultStore = new ActionRunResultStore()
    const scheduleStore = new ActionScheduleStore()
    const settingsStore = new ActionRunSettingsStore(actionOverride.id, null)
    const usageScopeStore = new ActionUsageScopeStore()
    const unrelatedRender = vi.fn()

    function UnrelatedContent() {
        unrelatedRender()

        return <div>Conversation</div>
    }

    render(
        <AppThemeProvider>
            <UnrelatedContent />
            <ActionPopupBottomRow
                action={actionOverride}
                assignmentContext={context}
                conversationStore={conversationStore}
                historyStore={historyStore}
                inputStore={inputStore}
                resultStore={resultStore}
                runValidationError={null}
                scheduleStore={scheduleStore}
                settingsStore={settingsStore}
                usageScopeStore={usageScopeStore}
            />
        </AppThemeProvider>,
    )

    return { conversationStore, unrelatedRender }
}

describe('ActionPopupBottomRow', () => {
    beforeEach(() => {
        window.md2Actions = { onActionRun: vi.fn(() => vi.fn()) } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { '': { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        actionPromptDraftService.clearAll()
        actionRunRegistry.stop()
        delete window.md2Actions
        cleanup()
        vi.restoreAllMocks()
    })

    it('lays out agent selectors left, usage centered, and run controls right in overflow-safe groups', () => {
        renderBottomRow()
        const bottomRow = screen.getByTestId('action-popup-bottom-row')
        const [selectors, usage, controls] = Array.from(bottomRow.children)

        expect(bottomRow).toHaveStyle({display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)'})
        expect(selectors).toHaveAttribute('data-footer-selectors')
        expect(selectors).toHaveStyle({ minWidth: '0', overflow: 'hidden' })
        expect(within(selectors as HTMLElement).getByRole('group', { name: 'Agent settings' })).toBeInTheDocument()
        expect(usage).toHaveAttribute('data-footer-usage')
        expect(usage).toHaveStyle({ justifySelf: 'center', minWidth: '0' })
        expect(controls).toHaveAttribute('data-footer-controls')
        expect(controls).toHaveStyle({ justifySelf: 'end' })
        expect(within(controls as HTMLElement).getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('enables Send from first live prompt change without rendering unrelated content', () => {
        const promptDraft = actionPromptDraftService.getDraft(action.id, context, null, { prepare: false })
        const { unrelatedRender } = renderBottomRow()
        const send = screen.getByRole('button', { name: 'Send' })
        expect(send).toBeDisabled()

        act(() => promptDraft.edit('P'))

        expect(send).toBeEnabled()
        expect(unrelatedRender).toHaveBeenCalledTimes(1)
    })

    it('disables Send when live prompt is cleared', () => {
        const promptDraft = actionPromptDraftService.getDraft(action.id, context, null, { prepare: false })
        promptDraft.edit('Plan')
        renderBottomRow()
        const send = screen.getByRole('button', { name: 'Send' })
        expect(send).toBeEnabled()
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

        act(() => promptDraft.edit(''))

        expect(send).toBeDisabled()
    })

    it('updates persisted waiting controls from trimmed live prompt without rendering unrelated content', async () => {
        const source = waitingConversation(action.id)
        window.md2Actions = {
            closeWaitingActionConversation: vi.fn(),
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        const promptDraft = actionPromptDraftService.getDraft(action.id, context, null, { prepare: false })
        const { unrelatedRender } = renderBottomRow(action, conversationStore)

        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

        act(() => promptDraft.edit('   '))
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        act(() => promptDraft.edit('Continue'))
        expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        expect(unrelatedRender).toHaveBeenCalledTimes(1)
        act(() => promptDraft.edit(''))
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    })

    it('renders icon-only Schedule and exposes descriptive tooltips for idle controls', async () => {
        actionPromptDraftService.getDraft(action.id, context, null, { prepare: false }).edit('Plan')
        renderBottomRow()
        const schedule = screen.getByRole('button', { name: 'Schedule' })

        expect(schedule).toHaveTextContent('')
        expect(schedule.querySelector('svg')).not.toBeNull()
        fireEvent.mouseOver(schedule)
        expect(await screen.findByText('Schedule', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
        fireEvent.mouseLeave(schedule)
        await waitFor(() => expect(screen.queryByText('Schedule', { selector: '.MuiTooltip-tooltip' })).not.toBeInTheDocument())
        fireEvent.mouseOver(screen.getByRole('button', { name: 'Send' }))
        expect(await screen.findByText('Send', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
    })

    it('provides a tooltip for command Run', async () => {
        const commandAction = { ...action, id: 'command', label: 'Command', type: 'command' as const }
        renderBottomRow(commandAction)
        const run = screen.getByRole('button', { name: 'Run' })

        fireEvent.mouseOver(run)
        expect(await screen.findByText('Run', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
    })

    it('finishes a persisted waiting conversation on normal Finish click', async () => {
        const source = waitingConversation(action.id)
        const updated = { ...source, completedAt: '2026-08-04T10:30:00.000Z', status: 'completed' as const }
        const closeWaitingActionConversation = vi.fn(async () => updated)
        window.md2Actions = {
            closeWaitingActionConversation,
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        const updateCardConversation = vi.spyOn(dataService.agents, 'updateAgentConversation').mockImplementation(() => undefined)
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        renderBottomRow(action, conversationStore)

        fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
        await vi.waitFor(() => expect(closeWaitingActionConversation).toHaveBeenCalledWith(source.path, 'completed'))
        expect(conversationStore.getSnapshot().selectedConversation).toEqual(updated)
        expect(updateCardConversation).toHaveBeenCalledWith(updated)
        await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument())
    })

    it.each([
        { outcome: 'Stop sequence', status: 'cancelled' as const },
        { outcome: 'Continue sequence', status: 'completed' as const },
    ])('requires Ctrl+click confirmation before $outcome', async ({ outcome, status }) => {
        const source = waitingConversation(action.id)
        const updated = { ...source, completedAt: '2026-08-04T10:30:00.000Z', status }
        const closeWaitingActionConversation = vi.fn(async () => updated)
        window.md2Actions = {
            closeWaitingActionConversation,
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService.agents, 'updateAgentConversation').mockImplementation(() => undefined)
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        renderBottomRow(action, conversationStore)

        const finish = screen.getByRole('button', { name: 'Finish' })
        fireEvent.mouseOver(finish)
        expect(await screen.findByText(/Ctrl\+click or long press to stop sequence/u, { selector: '.MuiTooltip-tooltip' }))
            .toBeInTheDocument()
        fireEvent.click(finish, { ctrlKey: true })

        expect(screen.getByRole('dialog', { name: 'Stop action sequence?' })).toBeInTheDocument()
        expect(closeWaitingActionConversation).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: outcome }))
        await vi.waitFor(() => expect(closeWaitingActionConversation).toHaveBeenCalledWith(source.path, status))
    })

    it('opens confirmation after long press and suppresses release click', async () => {
        const source = waitingConversation(action.id)
        const closeWaitingActionConversation = vi.fn()
        window.md2Actions = {
            closeWaitingActionConversation,
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        renderBottomRow(action, conversationStore)
        vi.useFakeTimers()
        const finish = screen.getByRole('button', { name: 'Finish' })

        fireEvent.pointerDown(finish, { button: 0, pointerId: 7 })
        act(() => vi.advanceTimersByTime(500))
        expect(screen.getByRole('dialog', { name: 'Stop action sequence?' })).toBeInTheDocument()
        fireEvent.pointerUp(finish, { pointerId: 7 })
        fireEvent.click(finish)

        expect(closeWaitingActionConversation).not.toHaveBeenCalled()
    })

    it('performs no operation when long press is cancelled before 500 ms', async () => {
        const source = waitingConversation(action.id)
        const closeWaitingActionConversation = vi.fn()
        window.md2Actions = {
            closeWaitingActionConversation,
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        renderBottomRow(action, conversationStore)
        vi.useFakeTimers()
        const finish = screen.getByRole('button', { name: 'Finish' })

        fireEvent.pointerDown(finish, { button: 0, pointerId: 8 })
        act(() => vi.advanceTimersByTime(499))
        fireEvent.pointerCancel(finish, { pointerId: 8 })
        act(() => vi.advanceTimersByTime(1))

        expect(screen.queryByRole('dialog', { name: 'Stop action sequence?' })).not.toBeInTheDocument()
        expect(closeWaitingActionConversation).not.toHaveBeenCalled()
    })

    it('reports stale persisted waiting state and keeps orphan controls', async () => {
        const source = waitingConversation(action.id)
        const staleError = new Error('Agent conversation is no longer waiting for input')
        window.md2Actions = {
            closeWaitingActionConversation: vi.fn(async () => { throw staleError }),
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        const reportError = vi.spyOn(dialogService, 'error').mockReturnValue({
            critical: false,
            id: 1,
            message: staleError.message,
            severity: 'error',
            title: 'Error',
        })
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.load()
        actionPromptDraftService.getDraft(action.id, context, null, { prepare: false }).edit('Continue')
        renderBottomRow(action, conversationStore)

        fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(staleError, {fallbackMessage: 'Could not finish waiting agent conversation'}))
        expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()
        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    })
})
