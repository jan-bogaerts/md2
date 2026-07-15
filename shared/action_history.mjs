const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const ROOT_COMMIT_SUFFIX = ' (root-commit)'

/** Parse branch and commit from Git's commit summary output. */
export function extractCommitSummary(output) {
    const match = COMMIT_LINE_PATTERN.exec(output)
    if (!match) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]

    return { branch, commit: match[2] }
}
