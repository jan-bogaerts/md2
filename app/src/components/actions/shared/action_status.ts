import type { ActionRunStatus } from '../../../data/action_run_types'

export function actionStatusLabel(status: ActionRunStatus) {
    if (status === 'okButNotAfter') return 'Completed, after-actions failed'

    return status
}
