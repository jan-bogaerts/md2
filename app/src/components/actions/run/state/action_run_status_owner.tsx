import { useSyncExternalStore } from 'react'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import { statusColor } from '../popup/action_popup_defaults'
import type { ActionRunResultStore } from './action_run_result_store'
import { ActionRunStatus } from './action_run_status'
import type { ActionRunBindingStore } from './action_run_binding_store'

interface ActionRunStatusOwnerProps {
    bindingStore: ActionRunBindingStore
    resultStore: ActionRunResultStore
}

/** Subscribes command status only to status/log values it renders. */
export function ActionRunStatusOwner({ bindingStore, resultStore }: ActionRunStatusOwnerProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? null)
    const runLogs = useRunSelector(boundRunId, (run) => run?.logs ?? null)
    const local = useSyncExternalStore(resultStore.subscribe, resultStore.getSnapshot, resultStore.getSnapshot)
    const status = runStatus ?? local.status
    const logs = runLogs ?? local.result?.logs ?? []
    if (status === 'idle') return null

    return <ActionRunStatus color={statusColor(status)} logs={logs} status={status} />
}
