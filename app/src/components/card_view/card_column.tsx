import { Box, Chip, IconButton, Paper, Tooltip, Typography } from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Plus from 'mdi-material-ui/Plus'
import type { ReactNode } from 'react'
import type { CardTypeConfig, WorktreeRecord } from '../../data/data_types'
import { requestOpenNewCardDialog } from '../project_command_events'
import { columnDropId } from './card_drag'
import { ProjectCardView, type CardHandlers } from './project_card_view'
import type { VisibleCardColumn } from './use_card_view_columns'
import { useCardColumnCards } from './use_card_column_cards'

const MIN_COLUMN_WIDTH = 200
const MAX_COLUMN_WIDTH = 320

interface CardColumnProps extends CardHandlers {
    cardTypes: CardTypeConfig[]
    column: VisibleCardColumn
    dropPreviewHeight: number | null
    dropPreviewIndex: number | null
    isMobile: boolean
    worktrees: WorktreeRecord[]
}

/** One status column: a polished droppable stack with header metadata and an empty target. */
export function CardColumn(props: CardColumnProps) {
    const {
        cardTypes, column, dropPreviewHeight, dropPreviewIndex, isMobile,
        worktrees, ...handlers
    } = props
    const cardPaths = useCardColumnCards(column.status)
    const { setNodeRef } = useDroppable({ id: columnDropId(column.status) })
    const columnLabel = column.status || 'Unassigned'
    const dropPlaceholder = (
        <Box
            aria-label="Card drop position"
            key="drop-preview"
            sx={{
                bgcolor: 'action.selected',
                border: '1.5px dashed',
                borderColor: 'primary.main',
                borderRadius: 1.25,
                minHeight: dropPreviewHeight ?? 107,
            }}
        />
    )
    const cardElements: ReactNode[] = []
    for (let index = 0; index <= cardPaths.length; index += 1) {
        if (dropPreviewIndex === index) cardElements.push(dropPlaceholder)
        const cardPath = cardPaths[index]
        if (!cardPath) continue

        cardElements.push(
            <ProjectCardView
                key={cardPath}
                cardPath={cardPath}
                cardTypes={cardTypes}
                worktrees={worktrees}
                {...handlers}
            />,
        )
    }

    return (
        <Paper
            aria-label={`${columnLabel} column`}
            sx={{
                bgcolor: 'action.hover',
                borderRadius: 1.5,
                display: 'flex',
                flex: isMobile ? '0 0 100%' : 1,
                flexDirection: 'column',
                gap: 1,
                maxWidth: isMobile ? '100%' : MAX_COLUMN_WIDTH,
                minWidth: isMobile ? '100%' : MIN_COLUMN_WIDTH,
                p: 1,
            }}
        >
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minHeight: 34, pl: 1, pr: 0.5 }}>
                <Box sx={{ bgcolor: column.color, borderRadius: '3px', flexShrink: 0, height: 8, width: 8 }} />
                <Typography
                    component="h2"
                    sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}
                >
                    {columnLabel}
                </Typography>
                <Chip
                    label={cardPaths.length}
                    size="small"
                    sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', fontSize: 11, height: 20 }}
                />
                <Box sx={{ flex: 1 }} />
                <Tooltip title="New card">
                    <IconButton aria-label={`Add card from ${columnLabel} column`} onClick={requestOpenNewCardDialog} size="small" sx={{ height: 26, width: 26 }}>
                        <Plus sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            </Box>
            <SortableContext items={cardPaths} strategy={verticalListSortingStrategy}>
                <Box ref={setNodeRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 52 }}>
                    {cardElements}
                    {cardPaths.length === 0 && dropPreviewIndex === null ? (
                        <Box
                            sx={{
                                border: '1.5px dashed',
                                borderColor: 'divider',
                                borderRadius: 1.25,
                                color: 'text.disabled',
                                fontSize: 12,
                                p: 2,
                                textAlign: 'center',
                            }}
                        >
                            Drop a card here
                        </Box>
                    ) : null}
                </Box>
            </SortableContext>
        </Paper>
    )
}
