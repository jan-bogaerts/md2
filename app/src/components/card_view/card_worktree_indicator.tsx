import type { ProjectCard, WorktreeRecord } from '../../data/data_types'
import { hasUnseenAgentResult } from '../../services/agents/agent_acknowledgement_service'
import { WorktreeSelector } from '../worktree_selector'

interface CardWorktreeIndicatorProps {
    card: ProjectCard
    onAssign: (cardPath: string, worktree: number | null) => void
    primaryPath: string
    projectKey: string
    worktrees: WorktreeRecord[]
}

function isConversationWaiting(card: ProjectCard) {
    return card.agentConversations.some((conversation) => {
        if (conversation.status !== 'running') return false

        const stateEvent = [...conversation.events].reverse().find((event) => event.type === 'waiting' || event.type === 'resumed')

        return stateEvent?.type === 'waiting'
    })
}

export function CardWorktreeIndicator(props: CardWorktreeIndicatorProps) {
    const { card, onAssign, primaryPath, projectKey, worktrees } = props
    const isWaiting = isConversationWaiting(card)
    const isRunning = !isWaiting && card.agentConversations.some((conversation) => conversation.status === 'running')
    const isUnseen = !isWaiting && !isRunning
        && hasUnseenAgentResult(projectKey, card.path, card.agentConversations)
    const agentState = isWaiting ? 'waiting for input' : isRunning ? 'running' : isUnseen ? 'unseen result' : 'idle'

    const handleAssign = (worktree: number | null) => onAssign(card.path, worktree)

    return (
        <WorktreeSelector
            agentState={agentState}
            assignment={card.header}
            labelPrefix={card.header.id}
            onAssign={handleAssign}
            primaryPath={primaryPath}
            worktrees={worktrees}
        />
    )
}
