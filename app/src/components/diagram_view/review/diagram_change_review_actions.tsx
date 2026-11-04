import { Button, DialogActions } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import type { CardTypeConfig, StateConfig } from '../../../data/data_types'
import { dialogService } from '../../../services/dialog_service'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { diagramSaveService, type DiagramSaveService } from '../../../services/diagrams/diagram_save_service'
import { projectSessionService, type ProjectSessionService } from '../../../services/project/project_session_service'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'
import { useEditableDiagramChangeIds } from '../editing/use_editable_diagram'

export type DiagramCardCreationService = Pick<
    ProjectSessionService,
    'addEventListener' | 'createCard' | 'getCardCreationSnapshot' | 'removeEventListener'
>

/** Save and card-creation actions bound to service-owned draft state. */
export function DiagramChangeReviewActions({
    cardTypes,
    project = projectSessionService,
    review = diagramChangeReviewService,
    save = diagramSaveService,
    session = diagramEditSessionService,
    states,
}: {
    cardTypes: CardTypeConfig[]
    project?: DiagramCardCreationService
    review?: DiagramChangeReviewService
    save?: DiagramSaveService
    session?: DiagramEditSessionService
    states: StateConfig[]
}) {
    const changeIds = useEditableDiagramChangeIds(session)
    const blockingItems = useSyncExternalStore(
        review.subscribeBlockingItems,
        review.getBlockingItemsSnapshot,
        review.getBlockingItemsSnapshot,
    )
    const title = useSyncExternalStore(review.subscribeCardTitle, review.getCardTitleSnapshot, review.getCardTitleSnapshot)
    const selectedType = useSyncExternalStore(review.subscribeCardType, review.getCardTypeSnapshot, review.getCardTypeSnapshot)
    const selectedColumn = useSyncExternalStore(
        review.subscribeTargetColumn,
        review.getTargetColumnSnapshot,
        review.getTargetColumnSnapshot,
    )
    const markdown = useSyncExternalStore(
        review.markdownDraft.subscribe,
        review.markdownDraft.getSnapshot,
        review.markdownDraft.getSnapshot,
    )
    const saveStatus = useSyncExternalStore(save.subscribeStatus, save.getStatusSnapshot, save.getStatusSnapshot)
    const cardCreation = useSyncExternalStore(
        (listener) => {
            project.addEventListener('cardCreationChanged', listener)

            return () => project.removeEventListener('cardCreationChanged', listener)
        },
        () => project.getCardCreationSnapshot(),
        () => project.getCardCreationSnapshot(),
    )
    const isReadOnly = useProjectReadOnly()
    const saveDisabled = changeIds.length === 0 || blockingItems.length > 0 || saveStatus === 'saving'
    const addCardDisabled = title.trim().length === 0
        || !cardTypes.some(({ type }) => type === selectedType)
        || !states.some(({ state }) => state === selectedColumn)
        || isReadOnly
        || cardCreation.isCreatingCard
        || blockingItems.length > 0
        || markdown.trim().length === 0
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
    const handleAddCard = useCallback(async () => {
        if (project.getCardCreationSnapshot().isCreatingCard) return

        review.markdownDraft.requestFlush()
        const body = review.markdownDraft.getSnapshot()
        const currentTitle = review.getCardTitleSnapshot()
        const currentType = review.getCardTypeSnapshot()
        const currentColumn = review.getTargetColumnSnapshot()
        if (
            currentTitle.trim().length === 0
            || !cardTypes.some(({ type }) => type === currentType)
            || !states.some(({ state }) => state === currentColumn)
            || body.trim().length === 0
            || review.getBlockingItemsSnapshot().length > 0
        ) return

        try {
            await project.createCard({ body, title: currentTitle, type: currentType }, currentColumn)
            review.close()
        } catch {
            // Project session reports card creation failures and keeps review draft available for retry.
        }
    }, [cardTypes, project, review, states])

    return (
        <DialogActions sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>Close</Button>
            <Button disabled={saveDisabled} onClick={handleSave} variant="outlined">
                {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </Button>
            <Button disabled={addCardDisabled} onClick={handleAddCard} variant="contained">
                {cardCreation.isCreatingCard ? 'Adding…' : 'Add card'}
            </Button>
        </DialogActions>
    )
}
