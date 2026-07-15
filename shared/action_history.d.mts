export interface CommitSummary {
    branch: string
    commit: string
}

export function extractCommitSummary(output: string): CommitSummary | null
