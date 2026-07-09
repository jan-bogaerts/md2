import { Dialog, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material'
import FileImport from 'mdi-material-ui/FileImport'
import { useState } from 'react'
import type { ProjectCard } from '../../data/data_types'
import type { RemarkableBridge } from '../../data/remarkable_bridge'
import { RemarkableImportPanel } from '../remarkable_import_panel'

interface RemarkableImportToolbarButtonProps {
    activeCards: ProjectCard[]
    bridge: RemarkableBridge | null
    isProjectOpen: boolean
}

/** Toolbar entry point for importing images from a Remarkable device. */
export function RemarkableImportToolbarButton(props: RemarkableImportToolbarButtonProps) {
    const { activeCards, bridge, isProjectOpen } = props
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    if (!bridge || !isProjectOpen) return null

    const handleOpenDialog = () => {
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
    }

    return (
        <>
            <Tooltip title="Import from Remarkable">
                <IconButton aria-label="Import from Remarkable" onClick={handleOpenDialog}>
                    <FileImport />
                </IconButton>
            </Tooltip>
            <Dialog fullWidth maxWidth="md" onClose={handleCloseDialog} open={isDialogOpen}>
                <DialogTitle>Remarkable import</DialogTitle>
                <DialogContent dividers>
                    <RemarkableImportPanel activeCards={activeCards} bridge={bridge} isProjectOpen={isProjectOpen} />
                </DialogContent>
            </Dialog>
        </>
    )
}
