import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuList } from '@mui/material'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { dialogService } from '../../services/dialog_service'
import { OpenInFileExplorerMenuItem } from './open_in_file_explorer_menu_item'

function installBridge(showInFileExplorer: ElectronDataBridge['showInFileExplorer']) {
    window.md2Data = { showInFileExplorer } as ElectronDataBridge
}

function renderMenuItem(props: Parameters<typeof OpenInFileExplorerMenuItem>[0]) {
    render(<MenuList><OpenInFileExplorerMenuItem {...props} /></MenuList>)
}

describe('OpenInFileExplorerMenuItem', () => {
    afterEach(() => {
        cleanup()
        delete window.md2Data
        vi.restoreAllMocks()
    })

    it('is hidden without the desktop bridge', () => {
        renderMenuItem({ onSelected: vi.fn(), path: 'design/F_1.md', rootPath: 'C:\repo' })

        expect(screen.queryByRole('menuitem', { name: 'Open in file explorer' })).not.toBeInTheDocument()
    })

    it('is hidden without a local project root', () => {
        installBridge(vi.fn())
        renderMenuItem({ onSelected: vi.fn(), path: 'design/F_1.md' })

        expect(screen.queryByRole('menuitem', { name: 'Open in file explorer' })).not.toBeInTheDocument()
    })

    it('closes the menu and reveals the path through the bridge', async () => {
        const showInFileExplorer = vi.fn().mockResolvedValue(undefined)
        const onSelected = vi.fn()
        installBridge(showInFileExplorer)
        renderMenuItem({ onSelected, path: 'design/F_1.md', rootPath: 'C:\repo' })

        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file explorer' }))

        await waitFor(() => expect(showInFileExplorer).toHaveBeenCalledWith({ path: 'design/F_1.md' }))
        expect(onSelected).toHaveBeenCalledTimes(1)
    })

    it('reports bridge failures through the dialog service', async () => {
        const failure = new Error('Project entry does not exist: design/F_1.md')
        const reportError = vi.spyOn(dialogService, 'error')
        installBridge(vi.fn().mockRejectedValue(failure))
        renderMenuItem({ onSelected: vi.fn(), path: 'design/F_1.md', rootPath: 'C:\repo' })

        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file explorer' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'File explorer could not be opened' }))
    })
})
