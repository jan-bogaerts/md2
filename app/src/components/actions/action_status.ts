import type { ActionExecutionStatus } from '../../data/action_run_types'

export function actionStatusLabel(status: ActionExecutionStatus) {
    if (status === 'okButNotAfter') return 'Completed, after-actions failed'

    return status
}
