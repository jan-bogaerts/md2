const AGENT_COMMIT_PATTERN = /Commit:\s+([0-9a-fA-F]{7,40})(?![0-9A-Za-z])/gmu;
const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/gmu;
const ROOT_COMMIT_SUFFIX = ' (root-commit)';

/** Parse every marked commit ID from agent stdout. */
export function extractAgentCommitIds(output) {
    return [...output.matchAll(AGENT_COMMIT_PATTERN)].map((match) => match[1]);
}

/** Parse every branch and commit from Git commit summary output. */
export function extractCommitSummaries(output) {
    return [...output.matchAll(COMMIT_LINE_PATTERN)].map((match) => {
        const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1];

        return { branch, commit: match[2] };
    });
}
