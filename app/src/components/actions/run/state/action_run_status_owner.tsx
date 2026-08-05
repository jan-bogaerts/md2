import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { statusColor } from './action_popup_defaults'
import type { ActionRunResultStore } from './action_run_result_store'
import { ActionRunStatus } from './action_run_status'

interface ActionRunStatusOwnerProps {
    actionId: string
    context: ActionContext
    resultStore: ActionRunResultStore
}

/** Subscribes command status only to status/log values it renders. */
export function ActionRunStatusOwner({ actionId, context, resultStore }: ActionRunStatusOwnerProps) {
    const runStatus = useActionRunSelector(actionId, context, (run) => run?.status ?? null)
    const runLogs = useActionRunSelector(actionId, context, (run) => run?.logs ?? null)
    const local = useSyncExternalStore(resultStore.subscribe, resultStore.getSnapshot, resultStore.getSnapshot)
    const status = runStatus ?? local.status
    const logs = runLogs ?? local.result?.logs ?? []
    if (status === 'idle') return null

    return <ActionRunStatus color={statusColor(status)} logs={logs} status={status} />
}
