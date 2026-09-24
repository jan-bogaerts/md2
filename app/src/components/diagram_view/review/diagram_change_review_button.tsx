import { useCallback } from 'react'
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'
import { DiagramToolboxActionButton } from '../creation_tools/diagram_toolbox_action_button'

/** Generates current review output and opens diagram change review. */
export function DiagramChangeReviewButton({review = diagramChangeReviewService}: {
    review?: Pick<DiagramChangeReviewService, 'open'>
}) {
    const handleActivate = useCallback(() => review.open(), [review])

    return (
        <DiagramToolboxActionButton
            label="Review"
            onActivate={handleActivate}
            tooltip="Review diagram changes"
        ><RateReviewOutlined fontSize="small" /></DiagramToolboxActionButton>
    )
}
