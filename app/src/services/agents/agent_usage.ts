import type { AgentConversation, AgentTokenUsage, ProjectSnapshot } from '../../data/data_types'
import { sumAgentTokenUsage } from '../../../../shared/agent_usage_math.mjs'
import type { AgentTokenUsageSummary } from '../../../../shared/agent_token_usage_summary.mjs'

export { sumAgentTokenUsage }

export interface AgentUsageVersion {
    name: string
    usage: AgentTokenUsage
}

export interface AgentFileChangeUsage {
    deletions: number
    insertions: number
}

export interface ProjectAgentUsage {
    archived: AgentUsageVersion
    current: AgentUsageVersion
    project: AgentTokenUsage
    releases: AgentUsageVersion[]
}

export function cardAgentTokenUsage(source: AgentConversation[] | ProjectSnapshot['activeCards'][number]): AgentTokenUsage {
    const conversations = Array.isArray(source) ? source : source.agentConversations

    return sumAgentTokenUsage(conversations.map(({ usage }) => usage))
}

/** Aggregate loaded conversations belonging to one action on one card. */
export function actionCardAgentTokenUsage(conversations: AgentConversation[], actionId: string, cardInternalId: string): AgentTokenUsage {
    const matchingUsage = conversations
        .filter((conversation) => conversation.actionId === actionId && conversation.cardInternalId === cardInternalId)
        .map(({ usage }) => usage)

    return sumAgentTokenUsage(matchingUsage)
}

/** Sum completed provider patches in one canonical conversation. */
export function conversationFileChangeUsage(conversation: AgentConversation | null): AgentFileChangeUsage | null {
    if (!conversation) return null
    let countedEvents = 0
    let deletions = 0
    let insertions = 0
    for (const entry of conversation.entries) {
        if (entry.kind !== 'event' || entry.type !== 'fileChange' || entry.status !== 'completed') continue
        const { deletions: eventDeletions, insertions: eventInsertions } = entry
        if (typeof eventDeletions !== 'number' || !Number.isSafeInteger(eventDeletions) || eventDeletions < 0) continue
        if (typeof eventInsertions !== 'number' || !Number.isSafeInteger(eventInsertions) || eventInsertions < 0) continue

        countedEvents += 1
        deletions += eventDeletions
        insertions += eventInsertions
    }

    return countedEvents > 0 ? { deletions, insertions } : null
}

function isInsideFolder(cardPath: string, folder: string) {
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const normalizedCardPath = cardPath.replace(/\\/gu, '/')

    return normalizedCardPath.startsWith(`${normalizedFolder}/`)
}

/** Use persisted project/release totals while deriving current and archived detail from loaded activity. */
export function projectAgentTokenUsage(
    snapshot: ProjectSnapshot | null,
    archivedFolder: string,
    summary: AgentTokenUsageSummary,
): ProjectAgentUsage {
    const activeCards = snapshot?.activeCards ?? []
    const backgroundCards = snapshot?.backgroundCards ?? []
    const currentUsage = sumAgentTokenUsage(activeCards.map(({ agentConversations }) => cardAgentTokenUsage(agentConversations)))
    const archivedUsage = sumAgentTokenUsage(
        backgroundCards
            .filter((card) => isInsideFolder(card.path, archivedFolder))
            .map(({ agentConversations }) => cardAgentTokenUsage(agentConversations)),
    )
    const releases = Object.entries(summary.releases)
        .map(([name, usage]) => ({ name, usage }))
        .sort((left, right) => left.name.localeCompare(right.name))

    return {
        archived: { name: 'Archived', usage: archivedUsage },
        current: { name: 'Current', usage: currentUsage },
        project: summary.projectUsage,
        releases,
    }
}
