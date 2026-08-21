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
import { configService } from '../../../../services/config/config_service'
import { BUILTIN_AGENT_PROFILES } from '../../../../data/agent_profiles'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'

const context = { kind: 'project' as const }
const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }
const action = {
    description: 'Custom prompt',
    id: CUSTOM_PROMPT_ACTION_ID,
    label: 'Custom prompt',
    phrases: [],
    prompt: '',
    type: 'agent',
} as unknown as ActionDefinition
const originalMatchMedia = window.matchMedia

function setMobileBreakpoint(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: matches && query.includes('max-width'),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
}

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

function renderBottomRow(
    actionOverride = action,
    conversationStore?: ActionConversationStore,
    embedded = false,
    contextOverride: ActionContext = context,
) {
    const activeConversationStore = conversationStore ?? new ActionConversationStore(actionOverride.id, contextOverride)
    const historyStore = new ActionHistoryStore(actionOverride, contextOverride)
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
                assignmentContext={contextOverride}
                conversationStore={activeConversationStore}
                embedded={embedded}
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

    return { conversationStore: activeConversationStore, unrelatedRender }
}

describe('ActionPopupBottomRow', () => {
    beforeEach(() => {
        setMobileBreakpoint(false)
        configService.init({
            desktopConfig: {
                agentProfiles: BUILTIN_AGENT_PROFILES,
                agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: '', thinkingLevel: 'none' } } },
            },
        })
        window.md2Actions = { onActionRun: vi.fn(() => vi.fn()) } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        actionPromptDraftService.clearAll()
        actionRunRegistry.stop()
        delete window.md2Actions
        configService.clear()
        cleanup()
        window.matchMedia = originalMatchMedia
        vi.restoreAllMocks()
    })

    it('uses an outer size container and an inner overflow-safe single row', () => {
        renderBottomRow()
        const bottomRow = screen.getByTestId('action-popup-bottom-row')
        const layout = bottomRow.firstElementChild as HTMLElement
        const selectors = layout.querySelector('[data-footer-selectors]') as HTMLElement
        const usage = layout.querySelector('[data-footer-usage]') as HTMLElement
        const controls = layout.querySelector('[data-footer-controls]') as HTMLElement

        expect(bottomRow).toHaveStyle({containerType: 'inline-size'})
        expect(layout).toHaveAttribute('data-footer-layout')
        expect(layout).toHaveStyle({display: 'flex', minWidth: '0', width: '100%'})
        expect(within(layout).getByRole('button', { name: 'Attach files' })
            .compareDocumentPosition(selectors) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(selectors).toHaveAttribute('data-footer-selectors')
        expect(selectors).toHaveStyle({ flexShrink: '1', minWidth: '158px', overflow: 'hidden' })
        expect(within(selectors as HTMLElement).getByRole('group', { name: 'Agent settings' })).toBeInTheDocument()
        expect(usage).toHaveAttribute('data-footer-usage')
        expect(usage).toHaveStyle({ display: 'flex', flexShrink: '1', minWidth: '235px', overflow: 'hidden' })
        expect(controls).toHaveAttribute('data-footer-controls')
        expect(controls).toHaveStyle({ flexShrink: '0', justifyContent: 'flex-end' })
        expect(within(controls as HTMLElement).getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('renders attachment control first for card and project agent prompts above the mobile breakpoint', () => {
        renderBottomRow(action, undefined, false, cardContext)
        const layout = screen.getByTestId('action-popup-bottom-row').firstElementChild as HTMLElement
        const attachment = within(layout).getByRole('button', { name: 'Attach files' })
        const selectors = layout.querySelector('[data-footer-selectors]') as HTMLElement

        expect(attachment.compareDocumentPosition(selectors) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

        cleanup()
        renderBottomRow()
        expect(screen.getByRole('button', { name: 'Attach files' })).toBeInTheDocument()
    })

    it.each([
        { contextOverride: cardContext, embedded: true, scope: 'card embedded' },
        { contextOverride: context, embedded: false, scope: 'project non-embedded' },
    ])('hides attachment control while keeping agent controls on mobile $scope rows', ({ contextOverride, embedded }) => {
        setMobileBreakpoint(true)
        renderBottomRow(action, undefined, embedded, contextOverride)
        const bottomRow = screen.getByTestId('action-popup-bottom-row')

        expect(within(bottomRow).queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
        expect(within(bottomRow).getByRole('group', { name: 'Agent settings' })).toBeInTheDocument()
        expect(within(bottomRow).getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
        expect(within(bottomRow).getByRole('button', { name: 'Send' })).toBeInTheDocument()
        if (embedded) expect(bottomRow).toHaveAttribute('data-embedded', 'true')
        else expect(bottomRow).not.toHaveAttribute('data-embedded')
    })

    it('marks the row as embedded without changing agent control behavior', () => {
        actionPromptDraftService.getDraft(action.id, context, null, { prepare: false }).edit('Plan')
        renderBottomRow(action, new ActionConversationStore(action.id, context), true)
        const bottomRow = screen.getByTestId('action-popup-bottom-row')

        expect(bottomRow).toHaveAttribute('data-embedded', 'true')
        expect(within(bottomRow).getByRole('button', { name: 'Send' })).toBeEnabled()
        expect(within(bottomRow).getByRole('button', { name: 'Schedule' })).toBeEnabled()
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

    it.each([
        { controls: ['Stop'], status: 'queued' as const },
        { controls: ['Stop'], status: 'running' as const },
        { controls: ['Finish', 'Send'], status: 'waitingForInput' as const },
    ])('disables $controls while historical conversation is displayed during $status', async ({ controls, status }) => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        if (!listener) throw new Error('Missing action run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const eventBase = {
            actionId: action.id, actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: action.id, runId: 'run-1', streaming: true,
        }
        emit({ ...eventBase, status: status === 'waitingForInput' ? 'running' : status, type: 'run' })
        if (status === 'waitingForInput') emit({ ...eventBase, status, type: 'agentState' })
        const run = actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot() ?? null
        actionPromptDraftService.getDraft(action.id, context, run, { prepare: false }).edit('Keep draft')
        const historicalConversation = { ...waitingConversation(action.id), path: 'history.json', status: 'completed' as const }
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
        const conversationStore = new ActionConversationStore(action.id, context)
        await conversationStore.select(historicalConversation.path)

        renderBottomRow(action, conversationStore)

        for (const control of controls) expect(screen.getByRole('button', { name: control })).toBeDisabled()
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

    it.each([false, true])('keeps command attachment absent and provides Run tooltip when mobile is %s', async (mobile) => {
        setMobileBreakpoint(mobile)
        const commandAction = { ...action, id: 'command', label: 'Command', type: 'command' as const }
        renderBottomRow(commandAction)
        const run = screen.getByRole('button', { name: 'Run' })

        expect(screen.getByTestId('action-popup-bottom-row')).not.toHaveAttribute('data-embedded')
        expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()

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
