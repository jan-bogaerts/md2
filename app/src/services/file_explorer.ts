import { getElectronDataBridge, type ShowInFileExplorerRequest } from '../data/electron_data_bridge'

/** Whether the operating system file manager can reveal entries of a project with the given local root. */
export function canShowInFileExplorer(rootPath: string | undefined) {
    return !!getElectronDataBridge() && !!rootPath
}

/** Opens the operating system file manager at a repository-relative file or folder and selects it. */
export async function showInFileExplorer(path: string) {
    const bridge = getElectronDataBridge()
    if (!bridge?.showInFileExplorer) throw new Error('File explorer is only available in the desktop app')

    const request: ShowInFileExplorerRequest = { path }
    await bridge.showInFileExplorer(request)
}
