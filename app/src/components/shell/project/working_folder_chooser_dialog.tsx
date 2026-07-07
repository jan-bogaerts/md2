import { Button, Stack, Typography } from '@mui/material'
import type { MouseEvent } from 'react'
import type { ProjectReference, TopLevelFolderReference } from '../../../data/data_types'
import type { StorageType } from '../../../data/project_session'

export interface WorkingFolderResolution {
    configuredWorkingFolder: string
    folders: TopLevelFolderReference[]
    project: ProjectReference
    storageType: StorageType
}

interface WorkingFolderChooserDialogProps {
    isLoading: boolean
    resolution: WorkingFolderResolution
    onCreateWorkingFolder: () => void
    onUseWorkingFolder: (folder: TopLevelFolderReference) => void
}

/** Missing working folder chooser shown inside the open project dialog. */
export function WorkingFolderChooserDialog(props: WorkingFolderChooserDialogProps) {
    const { isLoading, onCreateWorkingFolder, onUseWorkingFolder, resolution } = props

    const handleUseWorkingFolderClick = (event: MouseEvent<HTMLButtonElement>) => {
        const folderPath = event.currentTarget.value
        const folder = resolution.folders.find((currentFolder) => currentFolder.path === folderPath)
        if (!folder) return

        onUseWorkingFolder(folder)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">Working folder is missing: {resolution.configuredWorkingFolder}</Typography>
            {resolution.folders.map((folder) => (
                <Button
                    disabled={isLoading}
                    key={folder.path}
                    onClick={handleUseWorkingFolderClick}
                    value={folder.path}
                    variant="outlined"
                >
                    Use folder {folder.name}
                </Button>
            ))}
            <Button disabled={isLoading} onClick={onCreateWorkingFolder} variant="outlined">
                Create &apos;{resolution.configuredWorkingFolder}&apos; from template
            </Button>
        </Stack>
    )
}
