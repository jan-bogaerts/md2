import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionRun } from '../../services/actions/action_run_registry'
import { useActionRunSelector } from '../hooks/use_action_runs'
import { ActionLogErrorDisplay } from './action_log_error_display'
import type { ActionRunResultStore } from './action_run_result_store'

const EMPTY_LOGS: NonNullable<ReturnType<ActionRunResultStore['getSnapshot']>['result']>['logs'] = []
const errorLogs = new WeakMap<object, typeof EMPTY_LOGS>()

function selectErrorLogs(run: ActionRun | null) {
    if (!run) return EMPTY_LOGS
    const cached = errorLogs.get(run.logs)
    if (cached) return cached

    const errors = run.logs.filter(({ status }) => status === 'failed' || status === 'okButNotAfter')
    if (errors.length === 0) return EMPTY_LOGS
    errorLogs.set(run.logs, errors)

    return errors
}

interface ActionLogErrorOwnerProps {
    actionId: string
    context: ActionContext
    resultStore: ActionRunResultStore
}

/** Subscribes log display only to bound-run logs and local start failures. */
export function ActionLogErrorOwner({ actionId, context, resultStore }: ActionLogErrorOwnerProps) {
    const runLogs = useActionRunSelector(actionId, context, selectErrorLogs)
    const { result } = useSyncExternalStore(resultStore.subscribe, resultStore.getSnapshot, resultStore.getSnapshot)

    return <ActionLogErrorDisplay logs={runLogs.length > 0 ? runLogs : result?.logs ?? EMPTY_LOGS} />
}
