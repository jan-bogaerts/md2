import { Avatar, Box, Stack, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSyncExternalStore } from 'react'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { getCardTypeColor } from './card_drag'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { useProjectCard } from './use_project_card'
import { cardDragDropService } from './card_drag_drop_service'

interface CardDragOverlayProps {
    cardTypes: CardTypeConfig[]
}

interface CardDragOverlayContentProps {
    card: ProjectCard
    cardTypes: CardTypeConfig[]
    width: number | null
}

function initialsFor(value: string) {
    const parts = value.trim().split(/\s+/u)
    if (parts.length === 1 && parts[0].length <= 2) return parts[0].toUpperCase()

    return (parts.map((part) => part[0]).join('') || '?').slice(0, 2).toUpperCase()
}

/** Stable visual copy of a card that follows the pointer between sortable columns. */
export function CardDragOverlay(props: CardDragOverlayProps) {
    const { cardTypes } = props
    const { cardPath, width } = useSyncExternalStore(
        cardDragDropService.subscribeOverlay,
        cardDragDropService.getOverlaySnapshot,
        cardDragDropService.getOverlaySnapshot,
    )
    const card = useProjectCard(cardPath)
    if (!card) return null

    return <CardDragOverlayContent card={card} cardTypes={cardTypes} width={width} />
}

function CardDragOverlayContent(props: CardDragOverlayContentProps) {
    const { card, cardTypes, width } = props
    const theme = useTheme()
    const accentColor = getCardTypeColor(cardTypes, card.header.id) ?? theme.palette.primary.main
    const accentBackground = alpha(accentColor, 0.16)
    const runningRun = useRunningActionForContext(cardContext(card, cardTypes))
    const assignee = card.header.owner ?? card.header.author ?? card.header.id

    return (
        <Box
            aria-label={`Dragging ${card.header.id}`}
            sx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.25,
                boxShadow: 'var(--md2-card-drag-shadow)',
                minHeight: 107,
                overflow: 'hidden',
                pointerEvents: 'none',
                position: 'relative',
                transform: 'rotate(2deg)',
                width: width ?? 217,
            }}
        >
            <Box sx={{ bgcolor: accentColor, bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, p: '10px 12px 10px 14px' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
                    <Box
                        component="span"
                        sx={{
                            bgcolor: accentBackground,
                            borderRadius: '5px',
                            color: accentColor,
                            fontFamily: '"Roboto Mono", ui-monospace, monospace',
                            fontSize: 11.5,
                            fontWeight: 600,
                            px: 0.875,
                            py: 0.25,
                        }}
                    >
                        {card.header.id}
                    </Box>
                    <Box component="span" sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', fontSize: 11, gap: 0.625 }}>
                        <Box sx={{ bgcolor: runningRun ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
                        {runningRun ? 'Running' : 'Idle'}
                    </Box>
                </Stack>
                <Typography sx={{ color: 'text.primary', fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>
                    {card.header.title}
                </Typography>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end', minHeight: 26 }}>
                    <Avatar sx={{ bgcolor: accentColor, color: '#ffffff', fontSize: 9.5, fontWeight: 600, height: 22, width: 22 }}>
                        {initialsFor(assignee)}
                    </Avatar>
                </Stack>
            </Box>
        </Box>
    )
}
