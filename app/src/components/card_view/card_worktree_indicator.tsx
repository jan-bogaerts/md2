import { useCallback, useSyncExternalStore } from 'react'
import { WorktreeSelector } from '../worktree_selector'
import { SEQUENCE_WORKTREE_DISABLED_REASON, sequenceWorktreeAssignment } from '../sequence_worktree_assignment'
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
        return (
            <WorktreeSelector
                assignment={sequenceWorktreeAssignment(sequenceWorktree, worktrees)}
                assignmentTarget={{ cardInternalId, kind: 'card', path: cardPath }}
                disabled
                disabledReason={SEQUENCE_WORKTREE_DISABLED_REASON}
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
