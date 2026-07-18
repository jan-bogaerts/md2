import type { AgentConversation, AgentTokenUsage, ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { sumAgentTokenUsage } from '../../../../shared/agent_usage_math.mjs'

export { sumAgentTokenUsage }

export interface AgentUsageVersion {
    name: string
    usage: AgentTokenUsage
}

export interface ProjectAgentUsage {
    current: AgentUsageVersion
    project: AgentTokenUsage
    releases: AgentUsageVersion[]
}

export function cardAgentTokenUsage(card: ProjectCard): AgentTokenUsage {
    return sumAgentTokenUsage(card.agentConversations.map(({ usage }) => usage))
}

/** Aggregate loaded conversations belonging to one action on one card. */
export function actionCardAgentTokenUsage(conversations: AgentConversation[], actionId: string, cardPath: string): AgentTokenUsage {
    const matchingUsage = conversations
        .filter((conversation) => conversation.actionId === actionId && conversation.cardPath === cardPath)
        .map(({ usage }) => usage)

    return sumAgentTokenUsage(matchingUsage)
}

function releaseName(cardPath: string, projectFolder: string) {
    const normalizedProjectFolder = projectFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const historyPrefix = normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/history/` : 'history/'
    const normalizedCardPath = cardPath.replace(/\\/gu, '/')
    if (!normalizedCardPath.startsWith(historyPrefix)) return null

    const releaseSegments = normalizedCardPath.slice(historyPrefix.length).split('/')

    return releaseSegments.length >= 2 && releaseSegments[0].length > 0 ? releaseSegments[0] : null
}

/** Aggregate loaded agent logs by current board, archived release, and project. */
export function projectAgentTokenUsage(snapshot: ProjectSnapshot | null, projectFolder: string): ProjectAgentUsage {
    const activeCards = snapshot?.activeCards ?? []
    const backgroundCards = snapshot?.backgroundCards ?? []
    const currentUsage = sumAgentTokenUsage(activeCards.map(cardAgentTokenUsage))
    const releaseCards = new Map<string, ProjectCard[]>()

    for (const card of backgroundCards) {
        const name = releaseName(card.path, projectFolder)
        if (!name) continue

        releaseCards.set(name, [...(releaseCards.get(name) ?? []), card])
    }
    const releases = [...releaseCards.entries()]
        .map(([name, cards]) => ({ name, usage: sumAgentTokenUsage(cards.map(cardAgentTokenUsage)) }))
        .sort((left, right) => left.name.localeCompare(right.name))
    const project = sumAgentTokenUsage([currentUsage, ...releases.map(({ usage }) => usage)])

    return { current: { name: 'Current', usage: currentUsage }, project, releases }
}
