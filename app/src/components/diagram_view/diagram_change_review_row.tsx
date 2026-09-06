import { ListItemButton, ListItemText } from '@mui/material'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { generateDiagramChangeDescription } from '../../services/diagrams/diagram_change_descriptions'
import {
    diagramEditSessionService,
    type DiagramChange,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { useDialogError } from '../hooks/use_dialog_error'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'
import { useEditableDiagramChangeField } from './use_editable_diagram'

function useDiagramChange(changeId: string, session: DiagramEditSessionService) {
    const category = useEditableDiagramChangeField(changeId, 'category', session)
    const field = useEditableDiagramChangeField(changeId, 'field', session)
    const id = useEditableDiagramChangeField(changeId, 'id', session)
    const objectId = useEditableDiagramChangeField(changeId, 'objectId', session)
    const objectKind = useEditableDiagramChangeField(changeId, 'objectKind', session)
    const originalValue = useEditableDiagramChangeField(changeId, 'originalValue', session)
    const ownerId = useEditableDiagramChangeField(changeId, 'ownerId', session)
    const regionIndex = useEditableDiagramChangeField(changeId, 'regionIndex', session)
    const value = useEditableDiagramChangeField(changeId, 'value', session)

    return useMemo(() => {
        if (!category || !id || !objectId || !objectKind) return null

        return {category, field, id, objectId, objectKind, originalValue, ownerId, regionIndex, value} as DiagramChange
    }, [category, field, id, objectId, objectKind, originalValue, ownerId, regionIndex, value])
}

/** One semantic-change leaf; only this row observes fields of its change ID. */
export function DiagramChangeReviewRow({
    changeId,
    review = diagramChangeReviewService,
    session = diagramEditSessionService,
}: {
    changeId: string
    review?: DiagramChangeReviewService
    session?: DiagramEditSessionService
}) {
    const change = useDiagramChange(changeId, session)
    const subscribeSelected = useCallback(
        (listener: () => void) => review.subscribeSelectedChange(changeId, listener),
        [changeId, review],
    )
    const getSelectedSnapshot = useCallback(() => review.getSelectedChangeSnapshot(changeId), [changeId, review])
    const selected = useSyncExternalStore(subscribeSelected, getSelectedSnapshot, getSelectedSnapshot)
    const descriptionResult = useMemo(() => {
        if (!change) return { error: null, text: 'Change is no longer available.' }
        try {
            return { error: null, text: generateDiagramChangeDescription(changeId, session) }
        } catch (error) {
            return {
                error: error instanceof Error ? error : new Error(String(error)),
                text: 'Change description is unavailable.',
            }
        }
    }, [change, changeId, session])
    useDialogError(descriptionResult.error, 'Diagram change description could not be generated')
    const handleClick = useCallback(() => review.selectChange(changeId), [changeId, review])

    return (
        <ListItemButton onClick={handleClick} selected={selected}>
            <ListItemText primary={descriptionResult.text} slotProps={{ primary: { variant: 'body2' } }} />
        </ListItemButton>
    )
}
