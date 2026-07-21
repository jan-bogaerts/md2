import type { ProjectCard, WorktreeRecord } from '../../data/data_types'
import { hasUnseenAgentResult } from '../../services/agents/agent_acknowledgement_service'
import { WorktreeSelector } from '../worktree_selector'

interface CardWorktreeIndicatorProps {
    card: ProjectCard
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
    const { card, primaryPath, projectKey, worktrees } = props
    const isWaiting = isConversationWaiting(card)
    const isRunning = !isWaiting && card.agentConversations.some((conversation) => conversation.status === 'running')
    const isUnseen = !isWaiting && !isRunning
        && hasUnseenAgentResult(projectKey, card.path, card.agentConversations)
    const agentState = isWaiting ? 'waiting for input' : isRunning ? 'running' : isUnseen ? 'unseen result' : 'idle'

    return (
        <WorktreeSelector
            agentState={agentState}
            assignment={card.header}
            assignmentTarget={{ kind: 'card', path: card.path }}
            labelPrefix={card.header.id}
            primaryPath={primaryPath}
            worktrees={worktrees}
        />
    )
}
