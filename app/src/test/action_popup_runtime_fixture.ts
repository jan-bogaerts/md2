import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import { ActionRunSettingsStore } from '../services/actions/action_run_settings_service'
import { ActionConversationSearchService } from '../components/actions/conversation/search/action_conversation_search_service'
import { ActionConversationStore } from '../components/actions/conversation/state/action_conversation_store'
import { ActionInputLayoutStore } from '../components/actions/run/popup/action_input_layout_store'
import { ActionPopupFocusRequest } from '../components/actions/run/popup/action_popup_focus_request'
import type { ActionPopupRuntime } from '../components/actions/run/popup/action_popup_types'
import { ActionUsageScopeStore } from '../components/actions/run/popup/action_usage_scope_store'
import { ActionUsageValuesService } from '../components/actions/run/popup/action_usage_values_service'
import { ActionScheduleStore } from '../components/actions/run/schedule/action_schedule_store'
import { ActionHistoryStore } from '../components/actions/run/state/action_history_store'
import { ActionRunBindingStore } from '../components/actions/run/state/action_run_binding_store'
import { ActionRunInputStore } from '../components/actions/run/state/action_run_input_store'
import { ActionRunResultStore } from '../components/actions/run/state/action_run_result_store'

/** Builds one popup runtime with real scoped stores; overrides replace individual stores. */
export function createTestPopupRuntime(
    action: ActionDefinition,
    context: ActionContext,
    overrides: Partial<ActionPopupRuntime> = {},
): ActionPopupRuntime {
    const bindingStore = overrides.bindingStore ?? new ActionRunBindingStore(null)
    const conversationStore = overrides.conversationStore ?? new ActionConversationStore(action.id, context, bindingStore)
    const historyStore = overrides.historyStore ?? new ActionHistoryStore(action, context)
    const usageValuesService = overrides.usageValuesService ?? new ActionUsageValuesService({
        action,
        bindingStore,
        context,
        conversationStore,
        historyStore,
        scopeStore: new ActionUsageScopeStore(),
    })

    return {
        agentLayoutStore: new ActionInputLayoutStore('agent'),
        bindingStore,
        commandLayoutStore: new ActionInputLayoutStore('command'),
        conversationSearchService: new ActionConversationSearchService(),
        conversationStore,
        focusRequest: new ActionPopupFocusRequest(),
        historyStore,
        inputStore: new ActionRunInputStore(),
        resultStore: new ActionRunResultStore(),
        runValidationError: null,
        scheduleStore: new ActionScheduleStore(),
        settingsStore: new ActionRunSettingsStore(action.id, null, context.kind),
        usageValuesService,
        ...overrides,
    }
}
