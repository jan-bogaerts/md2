import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import { actionPromptDraftService } from '../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { agentCapabilitiesService } from '../../services/agents/agent_capabilities_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionConversationStore } from './action_conversation_store'
import { ActionHistoryStore } from './action_history_store'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { ActionRunInputStore } from './action_run_input_store'
import { ActionRunResultStore } from './action_run_result_store'
import { ActionScheduleStore } from './action_schedule_store'

const context = { kind: 'project' as const }
const action = {
    description: 'Custom prompt',
    id: CUSTOM_PROMPT_ACTION_ID,
    label: 'Custom prompt',
    phrases: [],
    prompt: '',
    type: 'agent',
} as unknown as ActionDefinition

function renderBottomRow() {
    const conversationStore = new ActionConversationStore(action.id, context)
    const historyStore = new ActionHistoryStore(action, context)
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
                action={action}
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

    return { unrelatedRender }
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
})
