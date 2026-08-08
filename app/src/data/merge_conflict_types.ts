export type MergeConflictOperation = 'integrate' | 'rebase'
export type MergeConflictPhase = 'finalize' | 'rebase' | 'squash'

/** Renderer-safe view of one paused Git operation owned by desktop. */
export interface MergeConflictSession {
    conflictedPaths: string[]
    externalResolverConfigured: boolean
    id: string
    operation: MergeConflictOperation
    phase: MergeConflictPhase
    repositoryRoot: string
    worktree: number
}

export type WorktreeOperationOutcome =
    | { branchDeleted?: boolean, cardInternalId?: string, status: 'completed' }
    | { session: MergeConflictSession, status: 'conflict' }

export interface MergeConflictPathRequest {
    path: string
    sessionId: string
}

export interface MergeConflictSessionRequest {
    sessionId: string
}
