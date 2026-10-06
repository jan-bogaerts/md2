import type { ActionContext } from '../../../../data/action_context'
import type { AgentQuestion } from '../../../../data/data_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { generateUuid } from '../../../../data/uuid'
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
} from '../../conversation/state/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import type { ActionRunInputStore } from '../state/action_run_input_store'
import type { ActionRunResultStore } from '../state/action_run_result_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'

const DEFAULT_CONVERT_LABEL_LENGTH = 40

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
    conversationStore: ActionConversationStore,
    prepare: boolean,
    commandInitialValue?: string,
) {
    const initialValue = action.type === 'command' ? commandInitialValue ?? action.command ?? '' : undefined
    const runId = bindingStore.getSnapshot()
    const liveConversationId = runId ? actionRunRegistry.getRunStore(runId)?.getSnapshot().conversation?.id ?? null : null
    const conversationId = conversationStore.getSnapshot().selectedConversation?.id ?? liveConversationId

    return actionPromptDraftService.getDraft(action.id, context, conversationId, { initialValue, prepare })
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

async function runWithPrompt(
    input: ActionPopupOperationInput,
    prompt: string,
    previousRunId: string | null = null,
    submissionId: string | null = null,
    submittedDiagramPath: string | null = null,
    submittedConversationId: string | null = null,
) {
    const {
        action, bindingStore, context, conversationStore, historyStore, resultStore, runValidationError, settings,
        settingsStore,
    } = input
    resultStore.setRunning()
    const selectedRunId = bindingStore.getSnapshot()
    const selectedConversationId = conversationStore.getSnapshot().selectedConversation?.id ?? null
    let started = false
    try {
        if (runValidationError) throw new Error(runValidationError)

        const liveConversation = currentActionRun(bindingStore)?.conversation ?? null
        const continuationPath = conversationStore.continuationPath(liveConversation)
        const diagramPath = submittedDiagramPath ?? currentActionPromptDraft(
            action, context, bindingStore, conversationStore, false,
        ).getDiagramPath()
        const runInput = action.type === 'agent'
            ? {
                ...(settings.agent ? { agent: settings.agent } : {}),
                ...(continuationPath ? { continueFrom: continuationPath } : {}),
                ...(submittedConversationId ? { conversationId: submittedConversationId } : {}),
                ...(diagramPath ? { diagramPath } : {}),
                prompt,
                ...(submissionId ? { submissionId } : {}),
                ...(settings.model ? { model: settings.model } : {}),
                ...(settings.permissionMode ? { permissionMode: settings.permissionMode } : {}),
                thinkingLevel: settings.thinkingLevel,
                ...(settings.speedMode !== undefined ? { speedMode: settings.speedMode } : {}),
            }
            : { command: prompt }
        const handleStarted = (runId: string) => {
            started = true
            if (action.type === 'command') {
                currentActionPromptDraft(action, context, bindingStore, conversationStore, false)
                    .replace(action.command ?? '')
            }
            const selectionUnchanged = bindingStore.getSnapshot() === selectedRunId
                && (conversationStore.getSnapshot().selectedConversation?.id ?? null) === selectedConversationId
            if (selectionUnchanged) {
                bindingStore.setRunId(runId)
            }
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
        }
        if (submissionId && result.status === 'failed') {
            const failureMessage = result.logs.find((log) => log.status === 'failed')?.message ?? 'Action run failed'
            actionRunRegistry.failSubmission(submissionId, failureMessage)
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Action run failed'
        if (submissionId && !started) actionRunRegistry.failSubmission(submissionId, message)
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
        if (!submissionId || started) dialogService.error(error, { fallbackMessage: 'Action run failed' })
    }
}

export async function runPopupAction(input: ActionPopupOperationInput) {
    const { action, bindingStore, context, conversationStore, settingsStore } = input
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const agentActive = sessionActive && run?.activeActionType === 'agent'
    const promptDraft = currentActionPromptDraft(action, context, bindingStore, conversationStore, false, agentActive ? '' : undefined)
    const prompt = promptDraft.getSnapshot()

    if (agentActive && run) {
        if (
            run.status === 'waitingForInput'
            && !run.question
            && run.approvals.length === 0
            && settingsStore.getSnapshot().settingsChangedWhileWaiting
        ) {
            const conversationId = run.conversation?.id ?? conversationStore.getSnapshot().selectedConversation?.id
            if (!conversationId) throw new Error('Restart requires a conversation ID')
            const submissionId = actionRunRegistry.beginSubmission(action.id, context, prompt, null, conversationId)
            const diagramPath = promptDraft.getDiagramPath()
            promptDraft.clearForSend()
            await runWithPrompt(input, prompt, run.runId, submissionId, diagramPath, conversationId)
            return
        }
        let submissionId: string | null = null
        try {
            if (!run.activeActionId) throw new Error('Action run has no active agent')
            if (prompt.trim().length === 0) throw new Error('Queued agent prompt is empty')

            submissionId = actionRunRegistry.beginSubmission(action.id, context, prompt, run.runId, run.conversation?.id ?? null)
            promptDraft.clearForSend()
            await actionRunRegistry.enqueueSubmission(submissionId)
        } catch (error) {
            if (!submissionId) dialogService.error(error, { fallbackMessage: 'Could not send agent message' })
        }
        return
    }

    const conversationId = action.type === 'agent'
        ? conversationStore.getSnapshot().selectedConversation?.id ?? run?.conversation?.id ?? `agent-${generateUuid()}`
        : null
    const submissionId = action.type === 'agent' && prompt.trim().length > 0 && conversationId
        ? actionRunRegistry.beginSubmission(action.id, context, prompt, null, conversationId)
        : null
    const diagramPath = promptDraft.getDiagramPath()
    if (submissionId) promptDraft.clearForSend()
    await runWithPrompt(input, prompt, null, submissionId, diagramPath, conversationId)
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
    const prompt = currentActionPromptDraft(action, context, bindingStore, input.conversationStore, false).getSnapshot()
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
            ...(settings.speedMode !== undefined ? { speedMode: settings.speedMode } : {}),
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
    conversationStore: ActionConversationStore,
    status: 'cancelled' | 'completed',
) {
    const conversation = conversationStore.getSnapshot().selectedConversation
    if (!conversation) throw new Error('No agent conversation is selected')
    if (conversation.status !== 'waitingForInput') throw new Error('Selected agent conversation is no longer waiting for input')

    const updatedConversation = await defaultCloseWaitingConversation(conversation.path, status)
    conversationStore.updateConversation(updatedConversation)
    dataService.agents.updateAgentConversation(updatedConversation)
}

export async function cancelPopupAction(
    bindingStore: ActionRunBindingStore,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(conversationStore, 'cancelled')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not stop waiting agent conversation' })
        }
        return
    }

    await defaultCancelAction(run.runId)
}

export async function finishPopupAction(
    bindingStore: ActionRunBindingStore,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(bindingStore)
    if (activeRunHasHistoricalDisplay(run, conversationStore)) return

    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(conversationStore, 'completed')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not finish waiting agent conversation' })
        }
        return
    }

    try {
        await defaultFinishAction(run.runId)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Could not finish agent session' })
    }
}
