import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    ElectronActionBridge,
} from '../../data/electron_action_bridge'

export async function defaultActionHistoryLoader(bridge: ElectronActionBridge, request: ActionRunHistoryRequest) {
    return bridge.loadActionRunHistory(request)
}

interface LoadActionHistoryInput {
    action: ActionDefinition
    actionHistoryLoader: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    bridge: ElectronActionBridge | null
    context: ActionContext
}

export async function loadActionHistory(input: LoadActionHistoryInput): Promise<ActionRunHistoryEntry[]> {
    if (!input.bridge) return []

    return input.actionHistoryLoader(input.bridge, {
        actionId: input.action.id,
        context: input.context,
    })
}
