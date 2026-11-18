import type { CommitReference, DiffRequest, DiffResult, OpenInEditorRequest } from '../../data/electron_action_bridge'
import { getElectronActionBridge } from '../../data/electron_action_bridge'

export type DiffCommitReference = Pick<CommitReference, 'commit'>

function requireDiffBridge() {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Diff view requires Electron local mode')

    return bridge
}

/**
 * Render every file of one referenced commit through Git.
 */
export async function generateDiff(commitReference: DiffCommitReference): Promise<DiffResult> {
    const request: DiffRequest = { commit: commitReference.commit }

    return requireDiffBridge().generateDiff(request)
}

/**
 * Render only one repository path of one commit through Git.
 */
export async function generateFileDiff(commit: string, filePath: string): Promise<DiffResult> {
    const request: DiffRequest = { commit, filePath }

    return requireDiffBridge().generateDiff(request)
}

/** Open configured external editor at file and line clicked in diff view. */
export async function openDiffLine(request: OpenInEditorRequest): Promise<void> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Opening local files requires Electron local mode')

    await bridge.openInEditor(request)
}
