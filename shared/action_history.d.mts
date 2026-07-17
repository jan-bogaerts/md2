export interface CommitSummary {
    branch: string
    commit: string
}

export function extractCommitSummaries(output: string): CommitSummary[]
