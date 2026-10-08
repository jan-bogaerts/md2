const PHASES = new Set(['preparing-sequence', 'sequence-ready', 'preparing-child', 'child-ready', 'running', 'switching-target', 'squashing', 'committing', 'integrated', 'recording', 'recorded', 'finishing', 'completed']);
const STRING_FIELDS = ['checkoutPath', 'expectedBranch', 'sequenceBranch', 'baseCommit'];
const NULLABLE_FIELDS = ['childBranch', 'sourceCommit', 'targetCommit', 'integrationCommit', 'sourceTree', 'runId'];

/** Validate durable sequence Git progress without guessing missing transition data. */
export function parseSequenceBranchProgress(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sequence branch progress');
    if (!PHASES.has(value.phase)) throw new Error(`Invalid sequence branch phase: ${value.phase}`);
    for (const field of STRING_FIELDS) {
        if (typeof value[field] !== 'string' || value[field].length === 0) throw new Error(`Missing sequence branch ${field}`);
    }
    for (const field of NULLABLE_FIELDS) {
        if (value[field] !== null && (typeof value[field] !== 'string' || value[field].length === 0)) throw new Error(`Invalid sequence branch ${field}`);
    }
    if (!Array.isArray(value.childBranches) || value.childBranches.some((branch) => typeof branch !== 'string' || branch.length === 0)) throw new Error('Invalid sequence child branches');
    if (new Set(value.childBranches).size !== value.childBranches.length) throw new Error('Duplicate sequence child branch');

    if (!value.childCommits || typeof value.childCommits !== 'object' || Array.isArray(value.childCommits)) throw new Error('Invalid sequence child commits');
    for (const [branch, commit] of Object.entries(value.childCommits)) {
        if (!value.childBranches.includes(branch) || typeof commit !== 'string' || commit.length === 0) throw new Error('Invalid completed sequence child commit');
    }
    const childPrefix = `${value.sequenceBranch}-card-`;
    if (value.childBranches.some((branch) => !branch.startsWith(childPrefix))) throw new Error('Unowned sequence child branch');
    if (value.childBranch !== null && !value.childBranch.startsWith(childPrefix)) throw new Error('Unowned active sequence child branch');
    if (!['preparing-sequence', 'sequence-ready'].includes(value.phase) && (!value.childBranch || !value.targetCommit)) {
        throw new Error('Missing active sequence branch evidence');
    }
    if (['switching-target', 'squashing', 'committing', 'integrated', 'recording', 'recorded', 'finishing', 'completed'].includes(value.phase)
        && (!value.sourceCommit || !value.sourceTree)) throw new Error('Missing sequence integration evidence');
    if (value.phase === 'running' && !value.runId) throw new Error('Missing sequence action run ID');

    return Object.fromEntries([...STRING_FIELDS, ...NULLABLE_FIELDS, 'childBranches', 'childCommits', 'phase'].map((field) => [field, value[field]]));
}
