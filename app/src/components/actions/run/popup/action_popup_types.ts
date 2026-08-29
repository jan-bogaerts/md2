import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionScheduleStore } from '../schedule/action_schedule_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'
import type { ActionRunInputStore } from '../state/action_run_input_store'
import type { ActionRunResultStore } from '../state/action_run_result_store'
import type { ActionUsageValuesService } from './action_usage_values_service'

export interface ActionPopupContentProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    anchorElement: HTMLElement | null
    assignmentContext: ActionContext
    baseContext: ActionContext
    draggable?: boolean
    fullHeight: boolean
    initialRunId?: string
    onActivate?: () => void
    onClose: () => void
    onSelectAction: (actionId: string) => void
    onToggleFullHeight: () => void
    open: boolean
    popupEntryId?: string
    primaryPath: string | null
    readOnlyMessage: string | null
    stackPosition?: number
    target: string | null
    targetTitle?: string | null
    titleId: string
}

export interface ActionPopupRuntime {
    bindingStore: ActionRunBindingStore
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    scheduleStore: ActionScheduleStore
    settingsStore: ActionRunSettingsStore
    usageValuesService: ActionUsageValuesService
}
