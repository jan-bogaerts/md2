import { useMemo, useSyncExternalStore } from 'react'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { ActionLogErrorDisplay } from './action_log_error_display'
import { createErrorLogsSelector, EMPTY_ERROR_LOGS } from './action_log_error_selector'
import type { ActionRunResultStore } from '../run/state/action_run_result_store'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionLogErrorOwnerProps {
    bindingStore: ActionRunBindingStore
    resultStore: ActionRunResultStore
}

/** Subscribes log display only to bound-run logs and local start failures. */
export function ActionLogErrorOwner({ bindingStore, resultStore }: ActionLogErrorOwnerProps) {
    const selectErrorLogs = useMemo(() => createErrorLogsSelector(), [])
    const boundRunId = useBoundRunId(bindingStore)
    const runLogs = useRunSelector(boundRunId, selectErrorLogs)
    const { result } = useSyncExternalStore(resultStore.subscribe, resultStore.getSnapshot, resultStore.getSnapshot)

    return <ActionLogErrorDisplay logs={runLogs.length > 0 ? runLogs : result?.logs ?? EMPTY_ERROR_LOGS} />
}
