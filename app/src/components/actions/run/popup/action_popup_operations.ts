import type { ActionContext } from '../../../../data/action_context'
import type { AgentQuestion } from '../../../../data/data_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { getElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import type {
    ActionRunSettingsStore,
    ResolvedActionRunSettings,
} from '../../../../services/actions/action_run_settings_service'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import {
    defaultCancelAction,
    defaultCloseWaitingConversation,
    defaultConvertPromptToAction,
    defaultDismissWaitingConversationQuestions,
    defaultFinishAction,
    defaultRestartAction,
    defaultRunAction,
} from './action_popup_defaults'
import {
    isBrowsingHistoricalConversation,
    type ActionConversationStore,
} from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import type { ActionRunInputStore } from '../state/action_run_input_store'
import type { ActionRunResultStore } from '../state/action_run_result_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'

const DEFAULT_CONVERT_LABEL_LENGTH = 40

function hasPersistedSubmittedMessage(
    previousConversation: NonNullable<ReturnType<ActionConversationStore['getSnapshot']>['selectedConversation']>,
    currentConversation: ReturnType<ActionConversationStore['getSnapshot']>['selectedConversation'],
    prompt: string,
) {
    if (!currentConversation || currentConversation.path !== previousConversation.path) return false

    const previousEntryIds = new Set(previousConversation.entries.map(({ id }) => id))

    return currentConversation.entries.some((entry) => entry.kind === 'message'
        && entry.role === 'user'
        && entry.content === prompt
        && !previousEntryIds.has(entry.id))
}

function restorePrompt(action: ActionDefinition, context: ActionContext, runId: string | null, prompt: string) {
    actionPromptDraftService.getDraft(action.id, context, runId, { prepare: false }).edit(prompt)
}

async function enqueueActionPrompt(runId: string, content: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.enqueueActionPrompt) throw new Error('Agent prompt queue requires Electron')

    return bridge.enqueueActionPrompt(runId, content)
}

export interface ActionPopupOperationInput {
    action: ActionDefinition
    bindingStore: ActionRunBindingStore
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    settings: ResolvedActionRunSettings
    settingsStore: ActionRunSettingsStore
}

export function currentActionRun(bindingStore: ActionRunBindingStore) {
    const runId = bindingStore.getSnapshot()

    return runId ? actionRunRegistry.getRunStore(runId)?.getSnapshot() ?? null : null
}

export function currentActionPromptDraft(
    action: ActionDefinition,
    context: ActionContext,
    bindingStore: ActionRunBindingStore,
    prepare: boolean,
    commandInitialValue?: string,
) {
    const initialValue = action.type === 'command' ? commandInitialValue ?? action.command ?? '' : undefined

    return actionPromptDraftService.getDraft(action.id, context, bindingStore.getSnapshot(), { initialValue, prepare })
}

function resetSubmittedDraft(action: ActionDefinition, context: ActionContext, runId: string | null) {
    const draft = actionPromptDraftService.getDraft(action.id, context, runId, { prepare: false })
    if (action.type === 'command') {
        draft.replace(action.command ?? '')
        return
    }

    draft.clear()
}

function activeRunHasHistoricalDisplay(
    run: ReturnType<typeof currentActionRun>,
    conversationStore: ActionConversationStore,
) {
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'

    return isBrowsingHistoricalConversation(
        run?.conversation ?? null,
        conversationStore.getSnapshot().selectedConversation,
        sessionActive,
    )
}

async function runWithPrompt(input: ActionPopupOperationInput, prompt: string, previousRunId: string | null = null) {
    const {
        action, bindingStore, context, conversationStore, historyStore, resultStore, runValidationError, settings,
        settingsStore,
    } = input
    resultStore.setRunning()
    try {
        if (runValidationError) throw new Error(runValidationError)

        const liveConversation = currentActionRun(bindingStore)?.conversation ?? null
        const previousConversation = liveConversation ?? conversationStore.getSnapshot().selectedConversation
        const continuationPath = conversationStore.continuationPath(liveConversation)
        const diagramPath = currentActionPromptDraft(action, context, bindingStore, false).getDiagramPath()
        const runInput = action.type === 'agent'
            ? {
                ...(settings.agent ? { agent: settings.agent } : {}),
                ...(continuationPath ? { continueFrom: continuationPath } : {}),
                ...(diagramPath ? { diagramPath } : {}),
                prompt,
                ...(settings.model ? { model: settings.model } : {}),
                ...(settings.permissionMode ? { permissionMode: settings.permissionMode } : {}),
                thinkingLevel: settings.thinkingLevel,
            }
            : { command: prompt }
        const handleStarted = (runId: string) => {
            resetSubmittedDraft(action, context, bindingStore.getSnapshot())
            bindingStore.setRunId(runId)
            resultStore.setRunId(runId)
            settingsStore.markSettingsApplied()
        }
        const result = previousRunId
            ? await defaultRestartAction(previousRunId, action, context, runInput, handleStarted)
            : await defaultRunAction(action, context, runInput, handleStarted)
        resultStore.setResult(result)
        await historyStore.load()
        if (action.type === 'agent') {
            await conversationStore.load()
            if (previousRunId
                && result.status === 'failed'
                && previousConversation
                && !hasPersistedSubmittedMessage(
                    previousConversation,
                    conversationStore.getSnapshot().selectedConversation,
                    prompt,
                )) {
                restorePrompt(action, context, bindingStore.getSnapshot(), prompt)
            }
        }
    } catch (error) {
        if (previousRunId) restorePrompt(action, context, bindingStore.getSnapshot(), prompt)
        const message = error instanceof Error ? error.message : 'Action run failed'
        resultStore.setResult({
            changedPaths: [],
            logs: [{
                actionId: action.id,
                actionName: action.label,
                command: null,
                message,
                phase: 'main',
                status: 'failed',
                stderr: message,
                stdout: '',
            }],
            status: 'failed',
        })
        dialogService.error(error, { fallbackMessage: 'Action run failed' })
    }
}

export async function runPopupAction(input: ActionPopupOperationInput) {
    const { action, bindingStore, context, conversationStore, settingsStore } = input
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const agentActive = sessionActive && run?.activeActionType === 'agent'
    const promptDraft = currentActionPromptDraft(action, context, bindingStore, false, agentActive ? '' : undefined)
    const prompt = promptDraft.getSnapshot()

    if (agentActive && run) {
        if (
            run.status === 'waitingForInput'
            && !run.question
            && run.approvals.length === 0
            && settingsStore.getSnapshot().settingsChangedWhileWaiting
        ) {
            await runWithPrompt(input, prompt, run.runId)
            return
        }
        try {
            if (!run.activeActionId) throw new Error('Action run has no active agent')
            if (prompt.trim().length === 0) throw new Error('Queued agent prompt is empty')

            const revision = promptDraft.getRevision()
            await enqueueActionPrompt(run.runId, prompt)
            if (promptDraft.getRevision() === revision) {
                actionPromptDraftService.clearDraft(action.id, context, bindingStore.getSnapshot())
            }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not send agent message' })
        }
        return
    }

    await runWithPrompt(input, prompt)
}

/**
 * Keys each answer by the question text rather than by md2's synthetic question id, because the resumed
 * agent has never seen those ids and only recognises the question it wrote itself.
 */
export function composeRestoredQuestionAnswers(
    questions: AgentQuestion[],
    answers: Record<string, string[]>,
) {
    return questions
        .filter(({ id }) => answers[id]?.length)
        .map(({ id, question }) => `${question}: ${answers[id].join(', ')}`)
        .join('\n')
}

/**
 * Answers a question restored from a stored conversation: the streaming request id died with the agent
 * process, so the answers are resumed as an ordinary prompt on top of the stored conversation instead.
 */
export async function answerRestoredConversationQuestions(
    input: ActionPopupOperationInput,
    questions: AgentQuestion[],
    answers: Record<string, string[]>,
) {
    const content = composeRestoredQuestionAnswers(questions, answers)
    if (content.trim().length === 0) throw new Error('Missing agent question answers')

    await runWithPrompt(input, content)
}

/** Dismisses a question restored from a stored conversation, without resuming the agent. */
export async function dismissRestoredConversationQuestions(input: ActionPopupOperationInput) {
    const { conversationStore } = input
    const conversation = conversationStore.getSnapshot().selectedConversation
    if (!conversation) throw new Error('No agent conversation is selected')

    const updatedConversation = await defaultDismissWaitingConversationQuestions(conversation.path)
    conversationStore.updateConversation(updatedConversation)
    dataService.agents.updateAgentConversation(updatedConversation)
}

export async function convertPromptToAction(input: ActionPopupOperationInput) {
    const { action, bindingStore, context, inputStore, settings } = input
    const prompt = currentActionPromptDraft(action, context, bindingStore, false).getSnapshot()
    const { actionLabel } = inputStore.getSnapshot()
    inputStore.setConvertMessage(null)
    try {
        const label = actionLabel.trim().length > 0 ? actionLabel : prompt.trim().slice(0, DEFAULT_CONVERT_LABEL_LENGTH)
        const convertInput = {
            ...(settings.agent ? { agent: settings.agent } : {}),
            context,
            label,
            ...(settings.model ? { model: settings.model } : {}),
            ...(settings.permissionMode ? { permissionMode: settings.permissionMode } : {}),
            prompt,
        }
        const result = await defaultConvertPromptToAction(convertInput)
        inputStore.setConvertMessage(`Saved ${result.path}`)

        return true
    } catch (error) {
        inputStore.setConvertMessage(error instanceof Error ? error.message : 'Could not convert prompt to action')

        return false
    }
}

export async function saveAndRunPopupAction(input: ActionPopupOperationInput) {
    if (!await convertPromptToAction(input)) return

    await runPopupAction(input)
}

async function closeWaitingConversation(
    action: ActionDefinition,
    bindingStore: ActionRunBindingStore,
    context: ActionContext,
    conversationStore: ActionConversationStore,
    status: 'cancelled' | 'completed',
) {
    const conversation = conversationStore.getSnapshot().selectedConversation
    if (!conversation) throw new Error('No agent conversation is selected')
    if (conversation.status !== 'waitingForInput') throw new Error('Selected agent conversation is no longer waiting for input')

    const updatedConversation = await defaultCloseWaitingConversation(conversation.path, status)
    conversationStore.updateConversation(updatedConversation)
    dataService.agents.updateAgentConversation(updatedConversation)
    actionPromptDraftService.clearDraft(action.id, context, bindingStore.getSnapshot())
}

export async function cancelPopupAction(
    action: ActionDefinition,
    bindingStore: ActionRunBindingStore,
    context: ActionContext,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(action, bindingStore, context, conversationStore, 'cancelled')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not stop waiting agent conversation' })
        }
        return
    }

    await defaultCancelAction(run.runId)
    actionPromptDraftService.clearDraft(action.id, context, bindingStore.getSnapshot())
}

export async function finishPopupAction(
    action: ActionDefinition,
    bindingStore: ActionRunBindingStore,
    context: ActionContext,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(action, bindingStore, context, conversationStore, 'completed')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not finish waiting agent conversation' })
        }
        return
    }

    try {
        await defaultFinishAction(run.runId)
        actionPromptDraftService.clearDraft(action.id, context, bindingStore.getSnapshot())
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Could not finish agent session' })
    }
}
