import type { ActionContext } from '../../data/action_context'
import type { ActionScheduleTrigger } from '../../data/action_schedule_types'
import type { ActionDefinition } from '../../data/action_types'
import { getElectronActionBridge, type ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { actionRunner, type ActionRunInput, type ActionRunResult, type ConvertPromptToActionInput } from '../../services/action_runner'

export type PopupRunStatus = 'idle' | 'running' | ActionRunResult['status']
export type ConvertPromptToAction = (input: ConvertPromptToActionInput) => Promise<{ path: string }>
export type LoadHistory = (action: ActionDefinition, context: ActionContext) => Promise<ActionRunHistoryEntry[]>
export type RunAction = (action: ActionDefinition, context: ActionContext, input?: ActionRunInput) => Promise<ActionRunResult>
export type ScheduleAction = (action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) => Promise<void>

export function defaultRunAction(action: ActionDefinition, context: ActionContext, input?: ActionRunInput) {
    return actionRunner.run(action, context, input)
}

export function defaultLoadHistory(action: ActionDefinition, context: ActionContext) {
    return actionRunner.loadHistory(action, context)
}

export function defaultConvertPromptToAction(input: ConvertPromptToActionInput) {
    return actionRunner.convertPromptToAction(input)
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
