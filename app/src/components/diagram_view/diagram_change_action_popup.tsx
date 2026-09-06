import { Box } from '@mui/material'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { ActionPopup } from '../actions/run/popup/action_popup'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

/** Hosts agent handoff popup without observing editable diagram fields. */
export function DiagramChangeActionPopup({review = diagramChangeReviewService}: {
    review?: DiagramChangeReviewService
}) {
    const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
    const context = useSyncExternalStore(
        review.subscribeAgentHandoffContext,
        review.getAgentHandoffContextSnapshot,
        review.getAgentHandoffContextSnapshot,
    )
    const handleClose = useCallback(() => review.closeAgentHandoff(), [review])

    return (
        <>
            <Box
                aria-hidden="true"
                ref={setAnchorElement}
                sx={{ bottom: 24, height: 0, position: 'fixed', right: 24, width: 0 }}
            />
            {context && anchorElement ? (
                <ActionPopup anchorElement={anchorElement} context={context} draggable onClose={handleClose} />
            ) : null}
        </>
    )
}
