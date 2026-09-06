import { Dialog, DialogContent, DialogTitle, Stack } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramSaveService } from '../../services/diagrams/diagram_save_service'
import { DiagramChangeReviewActions } from './diagram_change_review_actions'
import { DiagramChangeReviewList } from './diagram_change_review_list'
import { DiagramChangeReviewReport } from './diagram_change_review_report'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

/** Modal review shell. Changing one semantic change remains inside its row leaf. */
export function DiagramChangeReviewDialog({
    review = diagramChangeReviewService,
    save,
    session = diagramEditSessionService,
}: {
    review?: DiagramChangeReviewService
    save?: DiagramSaveService
    session?: DiagramEditSessionService
}) {
    const open = useSyncExternalStore(review.subscribeOpen, review.getOpenSnapshot, review.getOpenSnapshot)
    const handleClose = useCallback(() => review.close(), [review])

    return (
        <Dialog fullWidth maxWidth="md" onClose={handleClose} open={open}>
            <DialogTitle>Review diagram changes</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <DiagramChangeReviewList review={review} session={session} />
                    <DiagramChangeReviewReport review={review} />
                </Stack>
            </DialogContent>
            <DiagramChangeReviewActions review={review} save={save} session={session} />
        </Dialog>
    )
}
