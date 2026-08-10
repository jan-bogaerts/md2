import { useEffect, useRef } from 'react'
import { hasRunningConversation } from '../../services/agents/card_agent_state'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeSelector } from '../worktree_selector'
import { useCardConversations, useCardWorktree } from './use_project_card'
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
    const activity = useCardConversations(cardPath, service)
    const assignment = useCardWorktree(cardPath, service)
    const isRunning = hasRunningConversation(activity?.conversations ?? [])
    const wasRunning = useRef(isRunning)

    useEffect(() => {
        const completed = wasRunning.current && !isRunning
        wasRunning.current = isRunning
        if (!completed || assignment?.worktree === null || assignment?.worktree === undefined) return

        void worktreeService.refresh().catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not refresh worktree status' })
        })
    }, [assignment?.worktree, isRunning])

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
