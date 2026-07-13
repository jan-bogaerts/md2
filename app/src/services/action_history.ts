import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    CommitMetadata,
    ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { ProjectReference } from '../data/data_types'

export const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu

const ROOT_COMMIT_SUFFIX = ' (root-commit)'

export interface CommitMetadataInput {
    actionId: string
    completedAt: string
    context: ActionContext
    output: string
    project: ProjectReference
}

/** Parse the git commit summary line (`[branch hash] message`) an action reported, if any. */
export function extractCommitMetadata(input: CommitMetadataInput): CommitMetadata | null {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match || !input.project.rootPath) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]

    return {
        actionId: input.actionId,
        branch,
        commit: match[2],
        completedAt: input.completedAt,
        filePaths: input.context.file ? [input.context.file] : [],
        repositoryRoot: input.project.rootPath,
    }
}

export async function defaultActionHistoryLoader(bridge: ElectronActionBridge, request: ActionRunHistoryRequest) {
    return bridge.loadActionRunHistory(request)
}

interface LoadActionHistoryInput {
    action: ActionDefinition
    actionHistoryLoader: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    actionsFolder: string | null
    bridge: ElectronActionBridge | null
    context: ActionContext
}

export async function loadActionHistory(input: LoadActionHistoryInput): Promise<ActionRunHistoryEntry[]> {
    if (!input.bridge || !input.actionsFolder) return []

    return input.actionHistoryLoader(input.bridge, {
        actionId: input.action.id,
        actionsFolder: input.actionsFolder,
        context: input.context,
    })
}
