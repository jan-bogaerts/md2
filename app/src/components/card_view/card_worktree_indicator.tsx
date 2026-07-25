import type { ProjectCard } from '../../data/data_types'
import { useEffect, useRef } from 'react'
import { hasRunningConversation } from '../../services/agents/card_agent_state'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeSelector } from '../worktree_selector'

interface CardWorktreeIndicatorProps {
    card: ProjectCard
    primaryPath: string
}

export function CardWorktreeIndicator(props: CardWorktreeIndicatorProps) {
    const { card, primaryPath } = props
    const isRunning = hasRunningConversation(card)
    const wasRunning = useRef(isRunning)

    useEffect(() => {
        const completed = wasRunning.current && !isRunning
        wasRunning.current = isRunning
        if (!completed || card.header.worktree === null || card.header.worktree === undefined) return

        void worktreeService.refresh().catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not refresh worktree status' })
        })
    }, [card.header.worktree, isRunning])

    return (
        <WorktreeSelector
            assignment={card.header}
            assignmentTarget={{ kind: 'card', path: card.path }}
            labelPrefix={card.header.id}
            primaryPath={primaryPath}
        />
    )
}
