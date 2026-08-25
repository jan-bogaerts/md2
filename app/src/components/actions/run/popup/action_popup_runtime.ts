import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { worktreeService } from '../../../../services/project/worktree_service'
import { ActionConversationStore } from '../../conversation/action_conversation_store'
import { ActionScheduleStore } from '../schedule/action_schedule_store'
import { ActionHistoryStore } from '../state/action_history_store'
import { ActionRunBindingStore } from '../state/action_run_binding_store'
import { ActionRunInputStore } from '../state/action_run_input_store'
import { ActionRunResultStore } from '../state/action_run_result_store'
import { ActionUsageScopeStore } from './action_usage_scope_store'
import type { ActionPopupRuntime } from './action_popup_types'

type ActionPopupBindings = Omit<ActionPopupRuntime, 'runValidationError' | 'settingsStore'>

/** Creates the stores whose lifecycle follows one selected popup action and assignment context. */
export function createActionPopupBindings(action: ActionDefinition, context: ActionContext): ActionPopupBindings {
    const initialRunId = actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot().runId ?? null
    const bindingStore = new ActionRunBindingStore(initialRunId)
    bindingStore.trackInitialRun(action.id, context)

    return {
        bindingStore,
        conversationStore: new ActionConversationStore(action.id, context, bindingStore),
        historyStore: new ActionHistoryStore(action, context),
        inputStore: new ActionRunInputStore(),
        resultStore: new ActionRunResultStore(),
        scheduleStore: new ActionScheduleStore(),
        usageScopeStore: new ActionUsageScopeStore(),
    }
}

/**
 * The message is rebuilt on every render but only reads the worktree list on the failing
 * path, so the popup never subscribes to worktree changes to keep a message it rarely shows.
 */
export function worktreeValidationMessage(action: ActionDefinition, context: ActionContext) {
    const hasWorktreeAssignment = context.worktree !== undefined || !!context.worktreeError
    if (!hasWorktreeAssignment && !action.needsWorkTree) return null
    if (context.kind !== 'card' && context.kind !== 'project') {
        const reason = action.needsWorkTree ? 'when needsWorkTree is set' : 'for a worktree run'
        return `Action "${action.label}" requires card or project context ${reason}`
    }
    if (context.worktreeError) return context.worktreeError
    if (context.worktree === undefined) return `Action "${action.label}" requires a worktree assignment`
    if (!/^[1-9]\d*$/u.test(context.worktree)) return `Invalid worktree index: ${context.worktree}`

    const worktree = Number.parseInt(context.worktree, 10)
    if (!Number.isSafeInteger(worktree)) return `Invalid worktree index: ${context.worktree}`
    const record = worktreeService.getRecords()[worktree - 1]
    if (!record) return `Configured worktree ${worktree} does not exist`
    if (!record.valid) return `Configured worktree ${worktree} is invalid: ${record.error}`

    return null
}
