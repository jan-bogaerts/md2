import { Box, Typography } from '@mui/material'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { PositionedDiagramGroup } from '../../services/diagrams/diagram_layout'

interface DiagramGroupProps {
    group: PositionedDiagramGroup
    onOpenDetails?: () => void
    onSelect?: (ctrlKey: boolean) => void
    selected?: boolean
}

/** Containment or trust-zone box; interactive only on the New diagram. */
export function DiagramGroup({ group, onOpenDetails, onSelect, selected = false }: DiagramGroupProps) {
    const interactive = !!onSelect
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => onSelect?.(event.ctrlKey)
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect?.(false)
    }
    const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (!onOpenDetails) return

        event.preventDefault()
        event.stopPropagation()
        onOpenDetails()
    }

    return (
        <Box
            aria-label={group.label}
            aria-pressed={interactive ? selected : undefined}
            component={interactive ? 'button' : 'div'}
            data-diagram-id={interactive ? group.id : undefined}
            data-diagram-kind={interactive ? 'group' : undefined}
            onClick={interactive ? handleClick : undefined}
            onDoubleClick={onOpenDetails ? handleDoubleClick : undefined}
            onKeyDown={interactive ? handleKeyDown : undefined}
            role={interactive ? 'button' : 'group'}
            sx={{
                bgcolor: 'transparent', color: 'text.primary', cursor: interactive ? 'pointer' : 'default', font: 'inherit', p: 0,
                border: '1px dashed', borderColor: 'custom.borderStrong', borderRadius: 1, height: group.height, left: group.x,
                pointerEvents: interactive ? 'auto' : 'none', position: 'absolute', textAlign: 'left', top: group.y,
                width: group.width, zIndex: 0,
                ...(selected ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } : {}),
                '&:focus-visible': interactive
                    ? { borderColor: 'primary.main', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 }
                    : {},
            }}
            type={interactive ? 'button' : undefined}
        >
            <Typography color="custom.text3" sx={{ bgcolor: 'background.default', left: 1, px: 0.5, position: 'absolute', top: 0.5 }} variant="overline">
                {group.label}
            </Typography>
        </Box>
    )
}
