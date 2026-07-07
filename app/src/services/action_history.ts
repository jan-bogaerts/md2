import type { ActionContext } from '../data/action_context'
import type { ProjectReference } from '../data/data_types'
import type { CommitMetadata } from '../data/electron_action_bridge'

export const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const ROOT_COMMIT_SUFFIX = ' (root-commit)'

export interface CommitMetadataInput {
    actionName: string
    completedAt: string
    context: ActionContext
    output: string
    project: ProjectReference
}

export function extractCommitMetadata(input: CommitMetadataInput): CommitMetadata | null {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match || !input.project.rootPath) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]

    const filePaths = input.context.file ? [input.context.file] : []

    return {
        actionName: input.actionName,
        branch,
        completedAt: input.completedAt,
        commit: match[2],
        filePaths,
        repositoryRoot: input.project.rootPath,
    }
}
