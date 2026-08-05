import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ThinkingLevel } from '../../../data/agent_profiles'
import { actionPromptDraftService } from '../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { dataService } from '../../../services/data/data_service'
import { dialogService } from '../../../services/dialog_service'
import {
    defaultCancelAction,
    defaultCloseWaitingConversation,
    defaultConvertPromptToAction,
    defaultFinishAction,
    defaultRestartAction,
    defaultRunAction,
} from './action_popup_defaults'
import type { ActionConversationStore } from '../conversation/action_conversation_store'
import type { ActionHistoryStore } from './action_history_store'
import type { ActionRunInputStore } from './action_run_input_store'
import type { ActionRunResultStore } from './action_run_result_store'

const DEFAULT_CONVERT_LABEL_LENGTH = 40

export interface ResolvedActionRunSettings {
    accessLevel: string
    agent: string
    approvalPolicy: string
    model: string
    thinkingLevel: ThinkingLevel
}

export interface ActionPopupOperationInput {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    settings: ResolvedActionRunSettings
}

export function currentActionRun(action: ActionDefinition, context: ActionContext) {
    return actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot() ?? null
}

export function currentActionPromptDraft(action: ActionDefinition, context: ActionContext, prepare: boolean) {
    const run = currentActionRun(action, context)

    return actionPromptDraftService.getDraft(action.id, context, run, { prepare })
}

async function runWithPrompt(input: ActionPopupOperationInput, prompt: string, previousRunId: string | null = null) {
    const { action, context, conversationStore, historyStore, inputStore, resultStore, runValidationError, settings } = input
    resultStore.setRunning()
    try {
        if (runValidationError) throw new Error(runValidationError)

        const liveConversation = currentActionRun(action, context)?.conversation ?? null
        const continuationPath = conversationStore.continuationPath(liveConversation)
        const runInput = action.type === 'agent'
            ? {
                ...(settings.accessLevel ? { accessLevel: settings.accessLevel } : {}),
                ...(settings.agent ? { agent: settings.agent } : {}),
                ...(settings.approvalPolicy ? { approvalPolicy: settings.approvalPolicy } : {}),
                ...(continuationPath ? { continueFrom: continuationPath } : {}),
                prompt,
                ...(settings.model ? { model: settings.model } : {}),
                thinkingLevel: settings.thinkingLevel,
            }
            : { extraPrompt: prompt }
        const handleStarted = (runId: string) => {
            resultStore.setRunId(runId)
            inputStore.markSettingsApplied()
            actionPromptDraftService.clearDraft(action.id, context, currentActionRun(action, context))
        }
        const result = previousRunId
            ? await defaultRestartAction(previousRunId, action, context, runInput, handleStarted)
            : await defaultRunAction(action, context, runInput, handleStarted)
        resultStore.setResult(result)
        await historyStore.load()
        if (action.type === 'agent') await conversationStore.load()
    } catch (error) {
        if (previousRunId) {
            const currentRun = currentActionRun(action, context)
            actionPromptDraftService.getDraft(action.id, context, currentRun, { prepare: false }).edit(prompt)
        }
        const message = error instanceof Error ? error.message : 'Action run failed'
        resultStore.setResult({
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
    const { action, context, inputStore } = input
    const run = currentActionRun(action, context)
    const promptDraft = actionPromptDraftService.getDraft(action.id, context, run, { prepare: false })
    const prompt = promptDraft.getSnapshot()
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const agentActive = sessionActive && run?.activeActionType === 'agent'

    if (agentActive && run) {
        if (run.question || run.approvals.length) return
        if (run.status === 'waitingForInput' && inputStore.getSnapshot().settingsChangedWhileWaiting) {
            await runWithPrompt(input, prompt, run.runId)
            return
        }
        try {
            if (run.activeActionStreaming) await promptDraft.send()
            else {
                await promptDraft.synchronize()
                actionPromptDraftService.clearDraft(action.id, context, run)
            }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not send agent message' })
        }
        return
    }

    await runWithPrompt(input, prompt)
}

export async function convertPromptToAction(input: ActionPopupOperationInput) {
    const { action, context, inputStore, settings } = input
    const prompt = currentActionPromptDraft(action, context, false).getSnapshot()
    const { actionLabel } = inputStore.getSnapshot()
    inputStore.setConvertMessage(null)
    try {
        const label = actionLabel.trim().length > 0 ? actionLabel : prompt.trim().slice(0, DEFAULT_CONVERT_LABEL_LENGTH)
        const convertInput = {
            ...(settings.accessLevel ? { accessLevel: settings.accessLevel } : {}),
            ...(settings.agent ? { agent: settings.agent } : {}),
            ...(settings.approvalPolicy ? { approvalPolicy: settings.approvalPolicy } : {}),
            context,
            label,
            ...(settings.model ? { model: settings.model } : {}),
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
    actionPromptDraftService.clearDraft(action.id, context, null)
}

export async function cancelPopupAction(
    action: ActionDefinition,
    context: ActionContext,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(action, context)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(action, context, conversationStore, 'cancelled')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not stop waiting agent conversation' })
        }
        return
    }

    await defaultCancelAction(run.runId)
    actionPromptDraftService.clearDraft(action.id, context, run)
}

export async function finishPopupAction(
    action: ActionDefinition,
    context: ActionContext,
    conversationStore: ActionConversationStore,
) {
    const run = currentActionRun(action, context)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    if (!run || !sessionActive) {
        try {
            await closeWaitingConversation(action, context, conversationStore, 'completed')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not finish waiting agent conversation' })
        }
        return
    }

    try {
        await defaultFinishAction(run.runId)
        actionPromptDraftService.clearDraft(action.id, context, run)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Could not finish agent session' })
    }
}
