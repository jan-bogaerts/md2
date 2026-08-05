import { useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import { defaultScheduleAction } from './action_popup_defaults'
import type { ActionScheduleStore } from './action_schedule_store'
import { ActionScheduleForm } from './action_schedule_form'
import { createScheduleTrigger } from './action_schedule_trigger'

interface ActionScheduleOwnerProps {
    action: ActionDefinition
    context: ActionContext
    store: ActionScheduleStore
}

/** Owns schedule form state and registration. */
export function ActionScheduleOwner({ action, context, store }: ActionScheduleOwnerProps) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    if (!snapshot.open) return null

    const handleTimestampChange = (event: ChangeEvent<HTMLInputElement>) => store.setTimestamp(event.target.value)
    const handleRegister = async () => {
        store.setMessage(null)
        try {
            const trigger = createScheduleTrigger(store.getSnapshot().timestamp)
            await defaultScheduleAction(action, context, trigger)
            store.setMessage('Schedule registered')
        } catch (error) {
            store.setMessage(error instanceof Error ? error.message : 'Could not register schedule')
        }
    }

    return (
        <ActionScheduleForm
            message={snapshot.message}
            onRegister={handleRegister}
            onTimestampChange={handleTimestampChange}
            timestamp={snapshot.timestamp}
        />
    )
}
