import { Box } from '@mui/material'
import type { PositionedSequenceActivation } from '../../services/diagrams/diagram_layout'
import {
    diagramEmphasisService, type DiagramEmphasisService, type DiagramSurface,
} from '../../services/diagrams/diagram_emphasis_service'
import { useDiagramDecorationsDimmed } from './use_diagram_emphasis'
import { DIAGRAM_DIMMED_OPACITY } from './diagram_emphasis_presentation'

interface SequenceActivationProps {
    activation: PositionedSequenceActivation
    emphasis?: DiagramEmphasisService
    emphasisSurface?: DiagramSurface
}

/** One positioned sequence activation interval. */
export function SequenceActivation({activation, emphasis = diagramEmphasisService, emphasisSurface = 'current'}: SequenceActivationProps) {
    const dimmed = useDiagramDecorationsDimmed(emphasisSurface, emphasis)
    return (
        <Box
            aria-hidden="true"
            sx={{
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'text.secondary', height: activation.height,
                left: activation.x, opacity: dimmed ? DIAGRAM_DIMMED_OPACITY : 1, position: 'absolute', top: activation.y, width: activation.width, zIndex: 1,
            }}
        />
    )
}
