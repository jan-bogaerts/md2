import type { AgentConversation } from '../app/src/data/data_types'

export type ActivityOrigin = { kind: 'card'; cardInternalId: string } | { kind: 'project' }
export type ActionActivityStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'

export interface ActionSettings {
    agent: string
    model: string
    permissionMode: string
    thinkingLevel: string
}

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

export interface AgentActivityDetails {
    agent?: string | null
    model?: string
    permissionMode?: string
    thinkingLevel?: string
    type: 'agent'
}

export interface CommandActivityDetails {
    command: string
    output: string
    type: 'command'
}

interface ActionActivityRecordBase {
    commits: ActivityCommitReference[]
    completedAt: string
    conversationIds: string[]
    details: AgentActivityDetails | CommandActivityDetails
    runId: string
    origin: ActivityOrigin
    rootActionId: string
    rootActionLabel: string
    startedAt: string
    status: ActionActivityStatus
    type?: undefined
}

export interface AgentActionActivityRecord extends ActionActivityRecordBase {
    details: AgentActivityDetails
    rootConversationId: string
}

export interface CommandActionActivityRecord extends ActionActivityRecordBase {
    details: CommandActivityDetails
    rootConversationId?: never
}

export type ActionActivityRecord = AgentActionActivityRecord | CommandActionActivityRecord

export interface SystemActivityRecord {
    commits: [ActivityCommitReference]
    completedAt: string
    label: string
    origin: ActivityOrigin
    type: 'system'
}

export type ActivityRecord = ActionActivityRecord | SystemActivityRecord

export interface CardActivityFile {
    actionSettings: Record<string, ActionSettings>
    conversations: Omit<AgentConversation, 'path'>[]
    origin: ActivityOrigin
    records: ActivityRecord[]
    version: 4
}

export type ActivityRepairResult =
    | { activity: CardActivityFile; changed: boolean; status: 'repaired' | 'valid' }
    | { activity: null; changed: false; status: 'future' | 'unrecoverable' }

export function createActivityFile(origin: ActivityOrigin): CardActivityFile
export function parseActivityValue(value: unknown, expectedOrigin?: ActivityOrigin | null): CardActivityFile
export function parseActivityFile(content: string, expectedOrigin?: ActivityOrigin | null): CardActivityFile
export function migrateActivityValue(value: unknown, expectedOrigin?: ActivityOrigin | null): CardActivityFile
export function repairActivityFile(content: string, expectedOrigin?: ActivityOrigin | null): ActivityRepairResult
export function findActivityConversation(activity: CardActivityFile, conversationId: string): Omit<AgentConversation, 'path'>
