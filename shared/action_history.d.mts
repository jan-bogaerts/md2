export interface CommitSummary {
    branch: string
    commit: string
}

export function extractAgentCommitIds(output: string): string[]
export function extractCommitSummaries(output: string): CommitSummary[]
