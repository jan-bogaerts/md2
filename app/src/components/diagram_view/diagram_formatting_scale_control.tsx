import AddOutlined from '@mui/icons-material/AddOutlined'
import RemoveOutlined from '@mui/icons-material/RemoveOutlined'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
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

/** One labelled, bounded percentage stepper for diagram-wide formatting. */
export function DiagramFormattingScaleControl({
    field,
    label,
    store,
    surface,
}: {
    field: DiagramScaleField
    label: string
    store: DiagramFormattingScaleStore
    surface: 'Current' | 'New'
}) {
    const value = useDiagramFormattingScale(field, store)
    const decrease = () => store.setFormattingScale(field, value - DIAGRAM_FORMATTING_SCALE_STEP)
    const increase = () => store.setFormattingScale(field, value + DIAGRAM_FORMATTING_SCALE_STEP)
    const accessibleLabel = `${surface} ${label}`

    return (
        <Box aria-label={accessibleLabel} sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
            <Typography color="text.secondary" variant="caption">{accessibleLabel}</Typography>
            <Tooltip title={`Decrease ${accessibleLabel}`}>
                <span>
                    <IconButton
                        aria-label={`Decrease ${accessibleLabel}`}
                        disabled={value <= DIAGRAM_FORMATTING_SCALE_MINIMUM}
                        onClick={decrease}
                        size="small"
                    >
                        <RemoveOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Typography aria-label={`${accessibleLabel} value`} sx={{ minWidth: 38, textAlign: 'center' }} variant="caption">
                {value}%
            </Typography>
            <Tooltip title={`Increase ${accessibleLabel}`}>
                <span>
                    <IconButton
                        aria-label={`Increase ${accessibleLabel}`}
                        disabled={value >= DIAGRAM_FORMATTING_SCALE_MAXIMUM}
                        onClick={increase}
                        size="small"
                    >
                        <AddOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        </Box>
    )
}
