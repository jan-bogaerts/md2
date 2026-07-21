import type { AgentConversation } from '../app/src/data/data_types'

export type ActivityOrigin = { kind: 'card'; cardInternalId: string } | { kind: 'project' }
export type ActionActivityStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'

export interface ActivityCommitReference {
    available?: boolean
    actionId?: string
    actionName?: string
    branch: string
    commit: string
    committedAt: string
    deletions: number
    filePaths: string[]
    filesChanged: number
    insertions: number
}

export interface ActionActivityRecord {
    commits: ActivityCommitReference[]
    completedAt: string
    conversationIds: string[]
    executionId: string
    history: {
        agent?: string | null
        command?: string
        completedAt: string
        model?: string
        output: string
        prompt: string
        status: 'completed' | 'failed'
        thinkingLevel?: string
    }
    origin: ActivityOrigin
    rootActionId: string
    rootActionLabel: string
    startedAt: string
    status: ActionActivityStatus
}

export interface CardActivityFile {
    conversations: Omit<AgentConversation, 'path'>[]
    origin: ActivityOrigin
    records: ActionActivityRecord[]
    version: 1
}

export function createActivityFile(origin: ActivityOrigin): CardActivityFile
export function parseActivityValue(value: unknown, expectedOrigin?: ActivityOrigin | null): CardActivityFile
export function parseActivityFile(content: string, expectedOrigin?: ActivityOrigin | null): CardActivityFile
export function findActivityConversation(activity: CardActivityFile, conversationId: string): Omit<AgentConversation, 'path'>
