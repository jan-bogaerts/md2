import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ProjectSnapshot } from '../../../../data/data_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { useClaudeRateLimits } from '../../../hooks/use_claude_rate_limits'
import { useCodexRateLimits } from '../../../hooks/use_codex_rate_limits'
import { useProjectConfig } from '../../../hooks/use_project_config'
import { defaultScheduleAction } from '../popup/action_popup_defaults'
import type { ActionScheduleStore } from './action_schedule_store'
import { ActionScheduleForm, type ActionScheduleFormChange } from './action_schedule_form'
import { accountTrackerOptions, cardScheduleOptions, scheduleTargetStates } from './action_schedule_options'
import { canRegisterSchedule, createScheduleTrigger, type ActionScheduleTriggerSources } from './action_schedule_trigger'

const EMPTY_CARDS: ProjectSnapshot['activeCards'] = []

function subscribeActiveCards(listener: () => void) {
    dataService.addEventListener('changed', listener)

    return () => dataService.removeEventListener('changed', listener)
}

function getActiveCards() {
    return dataService.getState().snapshot?.activeCards ?? EMPTY_CARDS
}

interface ActionScheduleOwnerProps {
    action: ActionDefinition
    context: ActionContext
    store: ActionScheduleStore
}

/** Binds service-owned schedule form state to loaded runtime and project data. */
export function ActionScheduleOwner({ action, context, store }: ActionScheduleOwnerProps) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const activeCards = useSyncExternalStore(subscribeActiveCards, getActiveCards, getActiveCards)
    const claudeState = useClaudeRateLimits()
    const codexState = useCodexRateLimits()
    const projectConfig = useProjectConfig()
    if (!snapshot.open) return null

    const sources: ActionScheduleTriggerSources = {
        accountTrackers: accountTrackerOptions(claudeState, codexState),
        cards: cardScheduleOptions(activeCards, context.cardInternalId),
        targetStates: scheduleTargetStates(projectConfig?.states),
    }
    const handleChange = (change: ActionScheduleFormChange) => {
        if (change.type === 'trigger-type') store.setTriggerType(change.triggerType)
        else if (change.type === 'timestamp') store.setTimestamp(change.timestamp)
        else if (change.type === 'agent') store.setAgent(change.agent)
        else if (change.type === 'tracker') store.setAccountTracker(change.limitId, change.windowId)
        else if (change.type === 'card') store.setCardInternalId(change.cardInternalId)
        else store.setTargetState(change.targetState)
    }
    const handleRegister = async () => {
        store.setMessage(null)
        try {
            const trigger = createScheduleTrigger(store.getSnapshot(), sources)
            await defaultScheduleAction(action, context, trigger)
            store.setMessage('Schedule registered')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not register schedule' })
        }
    }

    return (
        <ActionScheduleForm
            accountTrackers={sources.accountTrackers}
            canRegister={canRegisterSchedule(snapshot, sources)}
            cards={sources.cards}
            message={snapshot.message}
            onChange={handleChange}
            onRegister={handleRegister}
            snapshot={snapshot}
            targetStates={sources.targetStates}
        />
    )
}
