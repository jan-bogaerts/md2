import { useMemo, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { ActionLogErrorDisplay } from './action_log_error_display'
import { createErrorLogsSelector, EMPTY_ERROR_LOGS } from './action_log_error_selector'
import type { ActionRunResultStore } from '../run/state/action_run_result_store'

interface ActionLogErrorOwnerProps {
    actionId: string
    context: ActionContext
    resultStore: ActionRunResultStore
}

/** Subscribes log display only to bound-run logs and local start failures. */
export function ActionLogErrorOwner({ actionId, context, resultStore }: ActionLogErrorOwnerProps) {
    const selectErrorLogs = useMemo(() => createErrorLogsSelector(), [])
    const runLogs = useActionRunSelector(actionId, context, selectErrorLogs)
    const { result } = useSyncExternalStore(resultStore.subscribe, resultStore.getSnapshot, resultStore.getSnapshot)

    return <ActionLogErrorDisplay logs={runLogs.length > 0 ? runLogs : result?.logs ?? EMPTY_ERROR_LOGS} />
}
