import type { AgentConversation, AgentTokenUsage } from '../../../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../../../data/electron_action_bridge'
import {
    conversationFileChangeUsage,
    sumAgentTokenUsage,
    type AgentFileChangeUsage,
} from '../../../../services/agents/agent_usage'

export interface LineUsage {
    commits: CommitReference[]
    deletions: number
    filesChanged: number
    insertions: number
}

export interface ActionUsageValues {
    changes: AgentFileChangeUsage | null
    lines: LineUsage
    tokens: AgentTokenUsage
}

export interface ScopedActionUsage {
    actionCard: ActionUsageValues
    conversation: ActionUsageValues | null
}

function conversationsForActionCard(
    conversations: AgentConversation[],
    liveConversation: AgentConversation | null,
    actionId: string,
    cardInternalId: string,
) {
    const conversationsById = new Map<string, AgentConversation>()
    for (const conversation of conversations) {
        if (conversation.actionId !== actionId || conversation.cardInternalId !== cardInternalId) continue

        conversationsById.set(conversation.id, conversation)
    }
    if (liveConversation?.actionId === actionId && liveConversation.cardInternalId === cardInternalId) {
        conversationsById.set(liveConversation.id, liveConversation)
    }

    return [...conversationsById.values()]
}

/** Sums reported patches; `null` when no conversation in scope reported any file change. */
function fileChangeUsage(conversations: AgentConversation[]) {
    return conversations.reduce<AgentFileChangeUsage | null>((total, conversation) => {
        const usage = conversationFileChangeUsage(conversation)
        if (!usage) return total
        if (!total) return { deletions: usage.deletions, insertions: usage.insertions }

        return { deletions: total.deletions + usage.deletions, insertions: total.insertions + usage.insertions }
    }, null)
}

function lineUsage(history: ActionRunHistoryEntry[]): LineUsage {
    const commits = history.flatMap((entry) => entry.commits ?? [])

    return commits.reduce((totals, commit) => ({
        commits: totals.commits,
        deletions: totals.deletions + commit.deletions,
        filesChanged: totals.filesChanged + commit.filesChanged,
        insertions: totals.insertions + commit.insertions,
    }), { commits, deletions: 0, filesChanged: 0, insertions: 0 })
}

function usageValues(conversations: AgentConversation[], history: ActionRunHistoryEntry[]): ActionUsageValues {
    return {
        changes: fileChangeUsage(conversations),
        lines: lineUsage(history),
        tokens: sumAgentTokenUsage(conversations.map(({ usage }) => usage)),
    }
}

/** Aggregates every usage metric for conversation and action/card scopes. */
export function scopedActionUsage(
    conversations: AgentConversation[],
    liveConversation: AgentConversation | null,
    displayedConversation: AgentConversation | null,
    history: ActionRunHistoryEntry[],
    actionId: string,
    cardInternalId: string,
): ScopedActionUsage {
    const actionCardConversations = conversationsForActionCard(
        conversations,
        liveConversation,
        actionId,
        cardInternalId,
    )
    const actionCard = usageValues(actionCardConversations, history)
    if (!displayedConversation) return { actionCard, conversation: null }

    const conversationHistory = history.filter((entry) => (
        entry.type === 'agent' && entry.rootConversationId === displayedConversation.id
    ))

    return {
        actionCard,
        conversation: usageValues([displayedConversation], conversationHistory),
    }
}
