import { WorktreeSelector } from '../worktree_selector'
import { useCardWorktree } from './use_project_card'
import { dataService, type DataService } from '../../services/data/data_service'

interface CardWorktreeIndicatorProps {
    cardId: string
    cardInternalId: string
    cardPath: string
    primaryPath: string
    service?: DataService
}

export function CardWorktreeIndicator(props: CardWorktreeIndicatorProps) {
    const { cardId, cardInternalId, cardPath, primaryPath, service = dataService } = props
    const assignment = useCardWorktree(cardPath, service)

    if (!assignment) return null

    return (
        <WorktreeSelector
            assignment={{ worktree: assignment.worktree, worktreeError: assignment.error, worktreeValue: assignment.value }}
            assignmentTarget={{ cardInternalId, kind: 'card', path: cardPath }}
            labelPrefix={cardId}
            primaryPath={primaryPath}
        />
    )
}
