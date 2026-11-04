import { Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useCallback, useSyncExternalStore } from 'react'
import type { CardTypeConfig, StateConfig } from '../../../data/data_types'
import { CardTypePillGroup } from '../../shell/project/card_type_pill_group'
import { NewCardColumnPicker } from '../../shell/project/new_card_column_picker'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

/** Card metadata fields bound directly to review-owned draft state. */
export function DiagramChangeReviewCardFields({
    cardTypes,
    isMobile,
    review = diagramChangeReviewService,
    states,
}: {
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    review?: DiagramChangeReviewService
    states: StateConfig[]
}) {
    const title = useSyncExternalStore(review.subscribeCardTitle, review.getCardTitleSnapshot, review.getCardTitleSnapshot)
    const selectedType = useSyncExternalStore(review.subscribeCardType, review.getCardTypeSnapshot, review.getCardTypeSnapshot)
    const selectedColumn = useSyncExternalStore(
        review.subscribeTargetColumn,
        review.getTargetColumnSnapshot,
        review.getTargetColumnSnapshot,
    )
    const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        review.setCardTitle(event.target.value)
    }, [review])
    const handleTypeChange = useCallback((type: string) => review.setCardType(type), [review])
    const handleColumnChange = useCallback((column: string) => review.setTargetColumn(column), [review])

    return (
        <Stack spacing={1.5} sx={{ flexShrink: 0 }}>
            <TextField
                autoFocus
                fullWidth
                onChange={handleTitleChange}
                placeholder="Card title…"
                slotProps={{ htmlInput: { 'aria-label': 'Title' } }}
                value={title}
            />
            <CardTypePillGroup
                cardTypes={cardTypes}
                isMobile={isMobile}
                onChange={handleTypeChange}
                selectedType={selectedType}
            />
            <Stack direction={isMobile ? 'column' : 'row'} spacing={1} sx={{ alignItems: isMobile ? 'stretch' : 'center' }}>
                <Typography color="custom.text3" sx={{ fontSize: 12 }}>Target column</Typography>
                <NewCardColumnPicker
                    isMobile={isMobile}
                    onChange={handleColumnChange}
                    selectedStatus={selectedColumn}
                    states={states}
                />
            </Stack>
        </Stack>
    )
}
