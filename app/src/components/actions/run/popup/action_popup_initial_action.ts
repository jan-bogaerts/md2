import type { ActionRunStatus } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActiveActionRun } from '../../../../services/actions/action_run_registry'
import type { CardAgentState } from '../../../../services/agents/card_agent_state'

export type PersistedActionStates = Record<string, CardAgentState>

function liveActionStatuses(activeRuns: ActiveActionRun[]) {
    const statuses: Record<string, ActionRunStatus> = {}
    for (const { rootActionId, status } of activeRuns) {
        if (status === 'waitingForInput' || !statuses[rootActionId]) statuses[rootActionId] = status
    }

    return statuses
}

/** Resolves one popup action from explicit choice, active work, persisted attention state, column default, then selector order. */
export function resolveInitialActionId(
    actions: Pick<ActionDefinition, 'id'>[],
    initialActionId: string | undefined,
    activeRuns: ActiveActionRun[],
    persistedStates: PersistedActionStates,
    defaultActionId?: string,
) {
    if (initialActionId) return initialActionId

    const liveStatuses = liveActionStatuses(activeRuns)
    const runningAction = actions.find(({ id }) => {
        const liveStatus = liveStatuses[id]

        return liveStatus === 'queued'
            || liveStatus === 'running'
            || (!liveStatus && persistedStates[id] === 'running')
    })
    if (runningAction) return runningAction.id

    const attentionAction = actions.find(({ id }) => {
        const liveStatus = liveStatuses[id]
        const persistedState = persistedStates[id]

        return liveStatus === 'waitingForInput'
            || (!liveStatus && (persistedState === 'waiting for input' || persistedState === 'unseen result'))
    })

    const defaultAction = actions.find(({ id }) => id === defaultActionId)

    return attentionAction?.id ?? defaultAction?.id ?? actions[0]?.id ?? null
}
