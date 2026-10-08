export interface SequenceBranchProgress {
    checkoutPath: string;
    expectedBranch: string;
    sequenceBranch: string;
    baseCommit: string;
    childBranch: string | null;
    childBranches: string[];
    childCommits: Record<string, string>;
    sourceCommit: string | null;
    targetCommit: string | null;
    integrationCommit: string | null;
    sourceTree: string | null;
    runId: string | null;
    phase: 'preparing-sequence' | 'sequence-ready' | 'preparing-child' | 'child-ready' | 'running' | 'switching-target' | 'squashing' | 'committing' | 'integrated' | 'recording' | 'recorded' | 'finishing' | 'completed';
}
export function parseSequenceBranchProgress(value: unknown): SequenceBranchProgress;
