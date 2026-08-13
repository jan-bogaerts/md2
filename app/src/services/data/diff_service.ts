import type { CommitReference, DiffResult, OpenInEditorRequest } from '../../data/electron_action_bridge'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import { resolveProjectConfigPaths } from '../../data/data_types'
import { configService } from '../config/config_service'

export type DiffCommitReference = Pick<CommitReference, 'branch' | 'commit' | 'filePaths'>

/**
 * Render one referenced commit through the configured Electron command.
 */
export async function generateDiff(commitReference: DiffCommitReference): Promise<DiffResult> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Diff view requires Electron local mode')

    const { branch, commit, filePaths } = commitReference
    const template = configService.get('project.diffCommand')
    const { projectFolder, releasesFolder, workingFolder } = resolveProjectConfigPaths(configService.getProjectConfig())

    return bridge.generateDiff({ branch, commit, filePath: filePaths[0] ?? '', projectFolder, releasesFolder, template, workingFolder })
}

/** Open configured external editor at file and line clicked in diff view. */
export async function openDiffLine(request: OpenInEditorRequest): Promise<void> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Opening local files requires Electron local mode')

    await bridge.openInEditor(request)
}
