import type { ActionContext } from '../../../../data/action_context'
import type { ActionScheduleTrigger } from '../../../../data/action_schedule_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type {
    ActionRunInput,
    ActionRunResult,
    AgentApprovalDecision,
    AgentApprovalRequestId,
} from '../../../../data/action_run_types'
import type { PreparedActionPrompt } from '../../../../data/action_run_types'
import type { AgentConversation } from '../../../../data/data_types'
import { getElectronActionBridge, type ActionRunHistoryEntry } from '../../../../data/electron_action_bridge'
import { defaultActionHistoryLoader, loadActionHistory } from '../../../../services/actions/action_history'
import { actionFilePath, createActionDefinition, type ConvertPromptToActionInput } from '../../../../services/actions/action_definition_writer'
import { dataService } from '../../../../services/data/data_service'
import { remoteConnectionService } from '../../../../services/data/remote_connection_service'
import { RemoteControlConnectionError } from '../../../../services/data/remote_control_storage_service'
import { projectPersistenceService } from '../../../../services/project/project_persistence_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { cancelElectronAction, restartElectronAction, runElectronAction } from '../../../../services/actions/electron_action_runner'
import {
    answerActionApproval,
    answerActionQuestion,
    finishActionRun,
    sendActionMessage,
} from '../../../../services/actions/action_run_registry'

export type PopupRunStatus = 'idle' | 'queued' | 'running' | 'waitingForInput' | ActionRunResult['status']
export type CancelAction = (runId: string) => Promise<void>
export type CloseWaitingConversation = (
    reference: string,
    status: 'cancelled' | 'completed',
) => Promise<AgentConversation>
export type SendMessage = (runId: string, content: string) => Promise<void>
export type FinishAction = (runId: string) => Promise<void>
export type AnswerQuestion = (
    runId: string,
    requestId: number | string | null,
    answers: Record<string, string[]>,
) => Promise<void>
export type AnswerApproval = (
    runId: string,
    requestId: AgentApprovalRequestId,
    decision: AgentApprovalDecision,
) => Promise<void>
export type ConvertPromptToAction = (input: ConvertPromptToActionInput) => Promise<{ path: string }>
export type LoadHistory = (action: ActionDefinition, context: ActionContext) => Promise<ActionRunHistoryEntry[]>
export type LoadConversation = (path: string) => Promise<AgentConversation>
export type LoadConversations = (context: ActionContext) => Promise<AgentConversation[]>
export type PreparePrompt = (action: ActionDefinition, context: ActionContext) => Promise<PreparedActionPrompt>
export type RunAction = (
    action: ActionDefinition,
    context: ActionContext,
    input?: ActionRunInput,
    onStarted?: (runId: string) => void,
) => Promise<ActionRunResult>
export type ScheduleAction = (action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) => Promise<void>

export function defaultRunAction(
    action: ActionDefinition,
    context: ActionContext,
    input?: ActionRunInput,
    onStarted?: (runId: string) => void,
) {
    return runElectronAction(action, context, input, onStarted)
}

export function defaultRestartAction(
    previousRunId: string,
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput,
    onStarted?: (runId: string) => void,
) {
    return restartElectronAction(previousRunId, action, context, input, onStarted)
}

export function defaultLoadHistory(action: ActionDefinition, context: ActionContext) {
    return loadActionHistory({
        action,
        actionHistoryLoader: defaultActionHistoryLoader,
        bridge: getElectronActionBridge(),
        context,
    })
}

export function defaultLoadConversation(path: string) {
    return dataService.loadAgentConversation(path)
}

export function defaultLoadConversations(context: ActionContext) {
    return dataService.listAgentConversations(context)
}

export async function defaultPreparePrompt(action: ActionDefinition, context: ActionContext) {
    const bridge = getElectronActionBridge()
    if (!bridge) {
        const remoteStatus = remoteConnectionService.getSnapshot().status
        if (remoteStatus === 'connecting' || remoteStatus === 'reconnecting') {
            throw new RemoteControlConnectionError('Remote action backend is reconnecting')
        }
        throw new Error('Preparing action prompts requires the Electron desktop app')
    }
    await projectPersistenceService.flushPendingChanges()
    const result = await bridge.prepareActionPrompt({ actionId: action.id, context })

    return result
}

export async function defaultConvertPromptToAction(input: ConvertPromptToActionInput) {
    const actionsFolder = dataService.getConfig()?.actionsFolder
    if (!actionsFolder) throw new Error('Cannot convert prompt before project config is loaded')

    const definition = createActionDefinition(input)
    const path = actionFilePath(actionsFolder, definition.label)
    await dataService.cards.saveProjectFile({ content: `${JSON.stringify(definition, null, 2)}\n`, path }, `Create ${path}`)

    return { definition, path }
}

export function defaultCancelAction(runId: string) {
    return cancelElectronAction(runId)
}

export function defaultCloseWaitingConversation(reference: string, status: 'cancelled' | 'completed') {
    const bridge = getElectronActionBridge()
    if (!bridge?.closeWaitingActionConversation) throw new Error('Closing a waiting conversation requires Electron')

    return bridge.closeWaitingActionConversation(reference, status)
}

export function defaultDismissWaitingConversationQuestions(reference: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.dismissWaitingActionConversationQuestions) {
        throw new Error('Dismissing stored conversation questions requires Electron')
    }

    return bridge.dismissWaitingActionConversationQuestions(reference)
}

export function defaultSendMessage(runId: string, content: string) {
    return sendActionMessage(runId, content)
}

export function defaultFinishAction(runId: string) {
    return finishActionRun(runId)
}

export function defaultAnswerQuestion(
    runId: string,
    requestId: number | string | null,
    answers: Record<string, string[]>,
) {
    return answerActionQuestion(runId, requestId, answers)
}

export function defaultAnswerApproval(
    runId: string,
    requestId: AgentApprovalRequestId,
    decision: AgentApprovalDecision,
) {
    return answerActionApproval(runId, requestId, decision)
}

export async function defaultScheduleAction(action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) {
    projectAccessService.requireWritable()
    const bridge = getElectronActionBridge()
    if (!bridge?.registerActionSchedule) throw new Error('Scheduling actions requires Electron local mode')

    await bridge.registerActionSchedule({ actionId: action.id, context, trigger })
}

export function statusColor(status: PopupRunStatus) {
    if (status === 'completed') return 'success.main'
    if (status === 'failed') return 'error.main'
    if (status === 'queued' || status === 'running' || status === 'waitingForInput') return 'info.main'
    if (status === 'okButNotAfter' || status === 'cancelled') return 'warning.main'

    return 'text.secondary'
}
