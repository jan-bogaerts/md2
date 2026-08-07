import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { agentCapabilitiesService } from '../../../../services/agents/agent_capabilities_service'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionConversationStore } from '../../conversation/action_conversation_store'
import { ActionHistoryStore } from '../state/action_history_store'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
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
                showSaveControls={false}
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
        actionPromptDraftService.clearAll()
        actionRunRegistry.stop()
        delete window.md2Actions
        cleanup()
        vi.restoreAllMocks()
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

        act(() => promptDraft.edit(''))

        expect(send).toBeDisabled()
    })

    it.each([
        { actionId: CUSTOM_PROMPT_ACTION_ID, label: 'Custom prompt', status: 'completed' as const, terminalButton: 'Finish' },
        { actionId: 'review', label: 'Review', status: 'cancelled' as const, terminalButton: 'Stop' },
    ])('closes reloaded waiting $label conversation with orphan controls', async (scenario) => {
        const selectedAction = { ...action, id: scenario.actionId, label: scenario.label }
        const source = waitingConversation(selectedAction.id)
        const updated = { ...source, completedAt: '2026-08-04T10:30:00.000Z', status: scenario.status }
        const closeWaitingActionConversation = vi.fn(async () => updated)
        window.md2Actions = {
            closeWaitingActionConversation,
            onActionRun: vi.fn(() => vi.fn()),
        } as unknown as typeof window.md2Actions
        const updateCardConversation = vi.spyOn(dataService.agents, 'updateAgentConversation').mockImplementation(() => undefined)
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([source])
        const conversationStore = new ActionConversationStore(selectedAction.id, context)
        await conversationStore.load()
        const promptDraft = actionPromptDraftService.getDraft(selectedAction.id, context, null, { prepare: false })
        promptDraft.edit('Continue')

        renderBottomRow(selectedAction, conversationStore)

        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: scenario.terminalButton }))
        await vi.waitFor(() => expect(closeWaitingActionConversation).toHaveBeenCalledWith(source.path, scenario.status))
        expect(conversationStore.getSnapshot().selectedConversation).toEqual(updated)
        expect(updateCardConversation).toHaveBeenCalledWith(updated)
        await vi.waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
        })
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
        expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    })
})
