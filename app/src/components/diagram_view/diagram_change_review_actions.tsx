import { Button, DialogActions } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import { dialogService } from '../../services/dialog_service'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { diagramSaveService, type DiagramSaveService } from '../../services/diagrams/diagram_save_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'
import { useEditableDiagramChangeIds } from './use_editable_diagram'

/** Review actions leaf; validity and change membership alone control delivery actions. */
export function DiagramChangeReviewActions({
    review = diagramChangeReviewService,
    save = diagramSaveService,
    session = diagramEditSessionService,
}: {
    review?: DiagramChangeReviewService
    save?: DiagramSaveService
    session?: DiagramEditSessionService
}) {
    const changeIds = useEditableDiagramChangeIds(session)
    const blockingItems = useSyncExternalStore(
        review.subscribeBlockingItems,
        review.getBlockingItemsSnapshot,
        review.getBlockingItemsSnapshot,
    )
    const saveStatus = useSyncExternalStore(save.subscribeStatus, save.getStatusSnapshot, save.getStatusSnapshot)
    const deliveryDisabled = changeIds.length === 0 || blockingItems.length > 0
    const handleClose = useCallback(() => review.close(), [review])
    const handleSave = useCallback(async () => {
        if (!review.requestSave()) return
        try {
            await save.save()
            review.close()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Edited diagram could not be saved' })
        }
    }, [review, save])
    const handleAgentHandoff = useCallback(() => review.requestAgentHandoff(), [review])

    return (
        <DialogActions sx={{ borderTop: 1, borderColor: 'divider', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>Close</Button>
            <Button disabled={deliveryDisabled || saveStatus === 'saving'} onClick={handleSave} variant="outlined">
                {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </Button>
            <Button disabled={deliveryDisabled} onClick={handleAgentHandoff} variant="contained">Send to agent</Button>
        </DialogActions>
    )
}
