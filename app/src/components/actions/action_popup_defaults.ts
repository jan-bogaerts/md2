import type { ActionContext } from '../../data/action_context'
import type { ActionScheduleTrigger } from '../../data/action_schedule_types'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunInput, ActionRunResult } from '../../data/action_run_types'
import { getElectronActionBridge, type ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { defaultActionHistoryLoader, loadActionHistory } from '../../services/action_history'
import { actionFilePath, createActionDefinition, type ConvertPromptToActionInput } from '../../services/action_definition_writer'
import { dataService } from '../../services/data_service'
import { cancelElectronAction, runElectronAction } from '../../services/electron_action_runner'

export type PopupRunStatus = 'idle' | 'running' | ActionRunResult['status']
export type CancelAction = (executionId: string) => Promise<void>
export type ConvertPromptToAction = (input: ConvertPromptToActionInput) => Promise<{ path: string }>
export type LoadHistory = (action: ActionDefinition, context: ActionContext) => Promise<ActionRunHistoryEntry[]>
export type RunAction = (
    action: ActionDefinition,
    context: ActionContext,
    input?: ActionRunInput,
    onStarted?: (executionId: string) => void,
) => Promise<ActionRunResult>
export type ScheduleAction = (action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) => Promise<void>

export function defaultRunAction(
    action: ActionDefinition,
    context: ActionContext,
    input?: ActionRunInput,
    onStarted?: (executionId: string) => void,
) {
    return runElectronAction(action, context, input, onStarted)
}

export function defaultLoadHistory(action: ActionDefinition, context: ActionContext) {
    return loadActionHistory({
        action,
        actionHistoryLoader: defaultActionHistoryLoader,
        actionsFolder: dataService.getConfig()?.actionsFolder ?? null,
        bridge: getElectronActionBridge(),
        context,
    })
}

export async function defaultConvertPromptToAction(input: ConvertPromptToActionInput) {
    const actionsFolder = dataService.getConfig()?.actionsFolder
    if (!actionsFolder) throw new Error('Cannot convert prompt before project config is loaded')

    const definition = createActionDefinition(input)
    const path = actionFilePath(actionsFolder, definition.name as string)
    await dataService.cards.saveProjectFile({ content: `${JSON.stringify(definition, null, 2)}\n`, path }, `Create ${path}`)

    return { definition, path }
}

export function defaultCancelAction(executionId: string) {
    return cancelElectronAction(executionId)
}

export async function defaultScheduleAction(action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) {
    const bridge = getElectronActionBridge()
    if (!bridge?.registerActionSchedule) throw new Error('Scheduling actions requires Electron local mode')

    await bridge.registerActionSchedule({ actionId: action.id, context, trigger })
}

export function statusColor(status: PopupRunStatus) {
    if (status === 'completed') return 'success.main'
    if (status === 'failed') return 'error.main'
    if (status === 'running') return 'info.main'

    return 'text.secondary'
}
