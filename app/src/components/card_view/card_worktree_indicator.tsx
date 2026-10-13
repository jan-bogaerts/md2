import { useCallback, useSyncExternalStore } from 'react'
import { normalizePath } from '../../../../shared/path_utils.mjs'
import { WorktreeSelector } from '../worktree_selector'
import { useOpenWorktrees } from '../hooks/use_worktrees'
import { useCardWorktree } from './use_project_card'
import { dataService, type DataService } from '../../services/data/data_service'
import { activeScheduleService, type ActiveScheduleService } from '../../services/actions/active_schedule_service'

interface CardWorktreeIndicatorProps {
    cardId: string
    cardInternalId: string
    cardPath: string
    primaryPath: string
    service?: DataService
    scheduleService?: ActiveScheduleService
}

export function CardWorktreeIndicator(props: CardWorktreeIndicatorProps) {
    const { cardId, cardInternalId, cardPath, primaryPath, service = dataService, scheduleService = activeScheduleService } = props
    const assignment = useCardWorktree(cardPath, service)
    const subscribe = useCallback((onStoreChange: () => void) => (
        scheduleService.subscribeSequenceCard(cardInternalId, onStoreChange)
    ), [cardInternalId, scheduleService])
    const getSequenceWorktree = useCallback(() => (
        scheduleService.getSequenceWorktreeForCard(cardInternalId)
    ), [cardInternalId, scheduleService])
    const sequenceWorktree = useSyncExternalStore(subscribe, getSequenceWorktree, getSequenceWorktree)
    const worktrees = useOpenWorktrees(!!sequenceWorktree)

    if (!assignment) return null

    if (sequenceWorktree) {
        const { checkoutPath, expectedBranch } = sequenceWorktree
        const checkoutKey = normalizePath(checkoutPath).toLowerCase()
        const index = worktrees.findIndex(({ path }) => normalizePath(path).toLowerCase() === checkoutKey)
        const record = worktrees[index]
        const worktreeError = !record ? `Sequence worktree is unavailable: ${checkoutPath}`
            : record.branch !== expectedBranch ? `Sequence worktree changed branch: ${checkoutPath}` : null
        const worktree = index < 0 ? 1 : index + 1

        return (
            <WorktreeSelector
                assignment={{ branch: expectedBranch, worktree, worktreeError, worktreeValue: index < 0 ? '?' : String(worktree) }}
                assignmentTarget={{ cardInternalId, kind: 'card', path: cardPath }}
                disabled
                disabledReason="This card is running within a sequence, so its worktree controls are disabled."
                labelPrefix={cardId}
                primaryPath={primaryPath}
            />
        )
    }

    return (
        <WorktreeSelector
            assignment={{
                branch: assignment.branch, worktree: assignment.worktree,
                worktreeError: assignment.error, worktreeValue: assignment.value,
            }}
            assignmentTarget={{ cardInternalId, kind: 'card', path: cardPath }}
            labelPrefix={cardId}
            primaryPath={primaryPath}
        />
    )
}
