import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import RemoveCircleOutline from '@mui/icons-material/RemoveCircleOutlineOutlined'
import { useSortable } from '@dnd-kit/sortable'
import type { Card } from '../../../../data/data_types'
import type { CardSequenceDraftService } from './card_sequence_draft_service'
import { cardSequenceItemId } from './card_sequence_dnd'

interface CardSequenceRowProps {
    card: Card
    selected: boolean
    service: CardSequenceDraftService
}

/** One selectable and sortable card-sequence row. */
export function CardSequenceRow({ card, selected, service }: CardSequenceRowProps) {
    const cardInternalId = card.header.internalId!
    const sortable = useSortable({ id: cardSequenceItemId(cardInternalId) })
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = sortable
    const handleSelect = () => service.selectCard(cardInternalId)
    const handleRemove = () => service.removeCard(cardInternalId)
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition } : { transition }

    return (
        <Box
            aria-selected={selected}
            onClick={handleSelect}
            ref={setNodeRef}
            role="option"
            style={style}
            sx={{
                alignItems: 'center',
                bgcolor: selected ? 'custom.primaryBg' : 'background.paper',
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 1.25,
                display: 'flex',
                gap: 1,
                px: 1,
                py: 0.75,
            }}
        >
            <Tooltip title={`Reorder ${card.header.id}`}>
                <IconButton
                    {...attributes}
                    {...listeners}
                    aria-label={`Reorder ${card.header.id}`}
                    ref={setActivatorNodeRef}
                    size="small"
                >
                    <DragIndicatorOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap variant="subtitle2">{card.header.id} · {card.header.title}</Typography>
                <Typography color="custom.text3" noWrap variant="caption">{card.path}</Typography>
            </Box>
            <Tooltip title={`Remove ${card.header.id}`}>
                <IconButton aria-label={`Remove ${card.header.id}`} onClick={handleRemove} size="small">
                    <RemoveCircleOutline fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
