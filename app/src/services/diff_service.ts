import type { ActionRunHistoryEntry, DiffResult, OpenInEditorRequest } from '../data/electron_action_bridge'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { configService } from './config_service'

/**
 * Render the diff for an action log entry's commit through the configured Electron command.
 * Fails fast when the diff bridge is unavailable or the entry carries no commit metadata.
 */
export async function generateDiff(entry: ActionRunHistoryEntry): Promise<DiffResult> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Diff view requires Electron local mode')
    if (!entry.commit) throw new Error('Action log entry has no commit to diff')

    const { branch, commit, filePaths } = entry.commit
    const template = configService.get('project.diffCommand') as string

    return bridge.generateDiff({ branch, commit, filePath: filePaths[0] ?? '', template })
}

/** Open VS Code at a project file and line clicked in the diff view. */
export async function openDiffLine(request: OpenInEditorRequest): Promise<void> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Opening VS Code requires Electron local mode')

    await bridge.openInEditor(request)
}
