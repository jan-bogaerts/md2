import type { CardActivityFile } from './card_activity.mjs'

export interface StatsActionFact {
    actionId: string
    actionLabel: string
    cardInternalId: string | null
    completedAt: string
    identity: string
}

export interface StatsConversationFact {
    actionId: string | null
    actionLabel: string | null
    agent: string | null
    cardInternalId: string | null
    cardPath: string | null
    completedAt: string | null
    elapsedMs: number | null
    hasMixedAttribution: boolean
    hasNestedAgentConversations: boolean
    identity: string
    isRootConversation: boolean
    model: string | null
    status: 'cancelled' | 'completed' | 'failed' | 'running' | 'waitingForInput'
    toolCallCount: number
    totalTokens: number
}

export interface ReleaseStats {
    actions: StatsActionFact[]
    conversations: StatsConversationFact[]
}

export interface ProjectStatsFileResult {
    releases: Record<string, ReleaseStats>
    warnings: string[]
}

export interface ActivityStatsSource {
    content: string
    path: string
}

export interface ActivityStatsCalculationResult {
    stats: ReleaseStats
    warnings: string[]
}

export const RELEASE_STATS_VERSION: 2
export function projectStatsFilePath(projectFolder: string): string
export function calculateActivityStats(activityFiles: CardActivityFile[]): ReleaseStats
export function calculateActivityStatsFromSources(sources: ActivityStatsSource[]): ActivityStatsCalculationResult
export function parseReleaseStats(value: unknown, fieldName?: string): ReleaseStats
export function parseProjectStatsFile(content: string, referencePath: string): ProjectStatsFileResult
export function serializeProjectStats(releases: Record<string, ReleaseStats>): string
