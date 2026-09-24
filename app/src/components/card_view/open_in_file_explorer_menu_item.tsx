import { MenuItem } from '@mui/material'
import { dialogService } from '../../services/dialog_service'
import { canShowInFileExplorer, showInFileExplorer } from '../../services/file_explorer'

interface OpenInFileExplorerMenuItemProps {
    path: string
    rootPath?: string
    onSelected: () => void
}

async function revealInFileExplorer(path: string, onSelected: () => void) {
    onSelected()
    try {
        await showInFileExplorer(path)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'File explorer could not be opened' })
    }
}

/** Menu command revealing a repository file or folder in the operating system file manager. */
export function OpenInFileExplorerMenuItem(props: OpenInFileExplorerMenuItemProps) {
    const { path, rootPath, onSelected } = props

    if (!canShowInFileExplorer(rootPath)) return null

    const openInFileExplorer = () => {
        void revealInFileExplorer(path, onSelected)
    }

    return <MenuItem onClick={openInFileExplorer}>Open in file explorer</MenuItem>
}
