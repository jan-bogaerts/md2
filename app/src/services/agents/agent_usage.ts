import type { AgentConversation, AgentTokenUsage, Card, ProjectSnapshot } from '../../data/data_types'
import { sumAgentTokenUsage } from '../../../../shared/agent_usage_math.mjs'

export { sumAgentTokenUsage }

export interface AgentUsageVersion {
    name: string
    usage: AgentTokenUsage
}

export interface ProjectAgentUsage {
    archived: AgentUsageVersion
    current: AgentUsageVersion
    project: AgentTokenUsage
    releases: AgentUsageVersion[]
}

export function cardAgentTokenUsage(source: AgentConversation[] | Card): AgentTokenUsage {
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

function releaseName(cardPath: string, releasesFolder: string) {
    const normalizedReleasesFolder = releasesFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const releasesPrefix = `${normalizedReleasesFolder}/`
    const normalizedCardPath = cardPath.replace(/\\/gu, '/')
    if (!normalizedCardPath.startsWith(releasesPrefix)) return null

    const releaseSegments = normalizedCardPath.slice(releasesPrefix.length).split('/')

    return releaseSegments.length >= 2 && releaseSegments[0].length > 0 ? releaseSegments[0] : null
}

/** Aggregate loaded agent conversations by current board, archived release, and project. */
function isInsideFolder(cardPath: string, folder: string) {
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const normalizedCardPath = cardPath.replace(/\\/gu, '/')

    return normalizedCardPath.startsWith(`${normalizedFolder}/`)
}

/** Aggregate loaded agent conversations by current board, archived cards, releases, and project. */
export function projectAgentTokenUsage(
    snapshot: ProjectSnapshot | null,
    releasesFolder: string,
    archivedFolder: string,
): ProjectAgentUsage {
    const activeCards = snapshot?.activeCards ?? []
    const backgroundCards = snapshot?.backgroundCards ?? []
    const currentUsage = sumAgentTokenUsage(activeCards.map(({ agentConversations }) => cardAgentTokenUsage(agentConversations)))
    const archivedUsage = sumAgentTokenUsage(
        backgroundCards
            .filter((card) => isInsideFolder(card.path, archivedFolder))
            .map(({ agentConversations }) => cardAgentTokenUsage(agentConversations)),
    )
    const releaseCards = new Map<string, Card[]>()

    for (const card of backgroundCards) {
        const name = releaseName(card.path, releasesFolder)
        if (!name) continue

        releaseCards.set(name, [...(releaseCards.get(name) ?? []), card])
    }
    const releases = [...releaseCards.entries()]
        .map(([name, cards]) => ({
            name,
            usage: sumAgentTokenUsage(cards.map(({ agentConversations }) => cardAgentTokenUsage(agentConversations))),
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    const project = sumAgentTokenUsage([currentUsage, archivedUsage, ...releases.map(({ usage }) => usage)])

    return {
        archived: { name: 'Archived', usage: archivedUsage },
        current: { name: 'Current', usage: currentUsage },
        project,
        releases,
    }
}
