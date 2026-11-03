import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionPromptDraft } from '../../../../services/actions/action_prompt_draft_service'
import { ActionSchedulePopover } from './action_schedule_popover'
import type { ActionScheduleStore } from './action_schedule_store'

interface ActionScheduleOwnerProps {
    accountId?: string
    action: ActionDefinition
    conversationId: string | null
    context: ActionContext
    promptDraft: ActionPromptDraft
    selectionValidationError?: string | null
    store: ActionScheduleStore
}

/** Mounts the schedule popover and its project-data consumers only while scheduling is open. */
export function ActionScheduleOwner(props: ActionScheduleOwnerProps) {
    const { store } = props
    const open = useSyncExternalStore(store.subscribe, store.getOpenSnapshot, store.getOpenSnapshot)
    if (!open) return null

    return <ActionSchedulePopover {...props} />
}
