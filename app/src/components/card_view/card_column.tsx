import { Paper, Stack, Typography } from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CardColumn as CardColumnModel } from '../../data/card_ordering'
import type { CardTypeConfig } from '../../data/data_types'
import { columnDropId, getCardTypeColor } from './card_drag'
import { ProjectCardView, type CardHandlers } from './project_card_view'

const COLUMN_WIDTH = 320

interface CardColumnProps extends CardHandlers {
    cardTypes: CardTypeConfig[]
    column: CardColumnModel
    isMobile: boolean
    openBodyPath: string | null
    selectedPath: string | null
}

/** One status column: a droppable, sortable stack of cards under the status title. */
export function CardColumn(props: CardColumnProps) {
    const { cardTypes, column, isMobile, openBodyPath, selectedPath, ...handlers } = props
    const { setNodeRef } = useDroppable({ id: columnDropId(column.status) })

    return (
        <Paper
            elevation={0}
            sx={{
                bgcolor: 'action.hover',
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                flexShrink: 0,
                p: 1,
                width: isMobile ? '100%' : COLUMN_WIDTH,
            }}
            variant="outlined"
        >
            <Typography sx={{ px: 0.5, py: 1 }} variant="subtitle1">
                {column.status || 'Unassigned'}
            </Typography>
            <SortableContext items={column.cards.map((card) => card.path)} strategy={verticalListSortingStrategy}>
                <Stack ref={setNodeRef} spacing={1} sx={{ minHeight: 24 }}>
                    {column.cards.map((card) => (
                        <ProjectCardView
                            key={card.path}
                            card={card}
                            color={getCardTypeColor(cardTypes, card.header.id)}
                            isBodyOpen={openBodyPath === card.path}
                            isMobile={isMobile}
                            isSelected={selectedPath === card.path}
                            {...handlers}
                        />
                    ))}
                </Stack>
            </SortableContext>
        </Paper>
    )
}
