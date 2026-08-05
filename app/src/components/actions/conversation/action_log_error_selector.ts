import type { ActionRunLogEntry } from '../../../data/action_run_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'

export const EMPTY_ERROR_LOGS: ActionRunLogEntry[] = []

/** Builds an error-log selector that preserves output identity while matching logs stay unchanged. */
export function createErrorLogsSelector() {
    let selectedLogs = EMPTY_ERROR_LOGS

    return (run: ActionRun | null) => {
        if (!run) return EMPTY_ERROR_LOGS

        const errors = run.logs.filter(({ status }) => status === 'failed' || status === 'okButNotAfter')
        if (errors.length === 0) {
            selectedLogs = EMPTY_ERROR_LOGS
            return EMPTY_ERROR_LOGS
        }
        if (errors.length === selectedLogs.length && errors.every((log, index) => log === selectedLogs[index])) {
            return selectedLogs
        }

        selectedLogs = errors
        return errors
    }
}
