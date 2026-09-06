import { Dialog, DialogTitle } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramGroupDrawingService,
    type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'
import { DiagramGroupLabelForm } from './diagram_group_label_form'

type DiagramGroupLabelDrawing = Pick<
    DiagramGroupDrawingService,
    'cancelDrawing' | 'completeGroup' | 'getPendingLabelBoxSnapshot' | 'subscribePendingLabelBox'
>

/** Collects required label after rectangle completion; group does not exist until Save. */
export function DiagramGroupLabelDialog({ drawing = diagramGroupDrawingService }: {
    drawing?: DiagramGroupLabelDrawing
}) {
    const pendingBox = useSyncExternalStore(
        drawing.subscribePendingLabelBox,
        drawing.getPendingLabelBoxSnapshot,
        drawing.getPendingLabelBoxSnapshot,
    )
    const handleClose = () => drawing.cancelDrawing()

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleClose} open={!!pendingBox}>
            <DialogTitle>New group</DialogTitle>
            {pendingBox ? <DiagramGroupLabelForm drawing={drawing} onCancel={handleClose} /> : null}
        </Dialog>
    )
}
