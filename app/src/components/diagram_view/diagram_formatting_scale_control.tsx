import { Box, IconButton, Popover, Slider, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import {
    DIAGRAM_FORMATTING_SCALE_MAXIMUM, DIAGRAM_FORMATTING_SCALE_MINIMUM,
} from '../../services/diagrams/diagram_data'
import {
    DIAGRAM_FORMATTING_SCALE_STEP, type DiagramScaleField,
} from '../../services/diagrams/diagram_formatting'
import {
    type DiagramFormattingStore, useDiagramFormattingScale,
} from './use_diagram_formatting'

interface DiagramFormattingScaleStore extends DiagramFormattingStore {
    setFormattingScale(field: DiagramScaleField, value: number): void
}

const FORMATTING_POPOVER_MINIMUM_WIDTH = 280
const FORMATTING_SLIDER_WIDTH = 200
const FORMATTING_ICON_BUTTON_SIZE = 28

function percentageText(value: number) {
    return `${value}%`
}

/** One icon-triggered percentage slider for diagram-wide formatting. */
export function DiagramFormattingScaleControl({
    field,
    icon,
    label,
    store,
    surface,
}: {
    field: DiagramScaleField
    icon: ReactNode
    label: string
    store: DiagramFormattingScaleStore
    surface: 'Current' | 'New'
}) {
    const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null)
    const value = useDiagramFormattingScale(field, store)
    const controlLabel = `${surface} ${label}`
    const adjustLabel = `Adjust ${controlLabel}`
    const headingId = `${surface.toLowerCase()}-${field}-heading`
    const handleOpen = (event: MouseEvent<HTMLButtonElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)
    const handleChange = (_event: Event, nextValue: number | number[]) => {
        if (typeof nextValue !== 'number') throw new Error('Diagram formatting slider requires one numeric value')
        store.setFormattingScale(field, nextValue)
    }

    return (
        <>
            <Tooltip title={adjustLabel}>
                <IconButton
                    aria-expanded={!!anchorElement}
                    aria-haspopup="dialog"
                    aria-label={adjustLabel}
                    onClick={handleOpen}
                    size="small"
                    sx={{
                        '&.Mui-focusVisible': { borderColor: 'primary.main', color: 'primary.main' },
                        '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        height: FORMATTING_ICON_BUTTON_SIZE,
                        width: FORMATTING_ICON_BUTTON_SIZE,
                    }}
                >
                    {icon}
                </IconButton>
            </Tooltip>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                onClose={handleClose}
                open={!!anchorElement}
                slotProps={{ paper: { 'aria-labelledby': headingId, role: 'dialog' } }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                <Box sx={{ minWidth: FORMATTING_POPOVER_MINIMUM_WIDTH, p: 2 }}>
                    <Typography id={headingId} sx={{ fontWeight: 600 }} variant="body2">
                        {controlLabel}
                    </Typography>
                    <Box sx={{ alignItems: 'center', display: 'flex', gap: 2, mt: 1 }}>
                        <Slider
                            aria-label={`${controlLabel} percentage`}
                            getAriaValueText={percentageText}
                            max={DIAGRAM_FORMATTING_SCALE_MAXIMUM}
                            min={DIAGRAM_FORMATTING_SCALE_MINIMUM}
                            onChange={handleChange}
                            step={DIAGRAM_FORMATTING_SCALE_STEP}
                            sx={{ width: FORMATTING_SLIDER_WIDTH }}
                            value={value}
                            valueLabelDisplay="auto"
                            valueLabelFormat={percentageText}
                        />
                        <Typography aria-label={`${controlLabel} value`} variant="body2">
                            {percentageText(value)}
                        </Typography>
                    </Box>
                </Box>
            </Popover>
        </>
    )
}
