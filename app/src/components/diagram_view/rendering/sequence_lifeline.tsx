import { Box } from '@mui/material'
import {
    diagramEmphasisService, type DiagramEmphasisService, type DiagramSurface,
} from '../../../services/diagrams/diagram_emphasis_service'
import { DIAGRAM_DIMMED_OPACITY } from '../surface/diagram_emphasis_presentation'
import { useDiagramDecorationsDimmed } from '../surface/use_diagram_emphasis'

const LIFELINE_TARGET_WIDTH = 16

interface SequenceLifelineProps {
    emphasis?: DiagramEmphasisService
    emphasisSurface?: DiagramSurface
    height: number
    nodeId: string
    x: number
    y: number
}

/** Dashed sequence lifeline with emphasis-owned presentation. */
export function SequenceLifeline({
    emphasis = diagramEmphasisService,
    emphasisSurface = 'current',
    height,
    nodeId,
    x,
    y,
}: SequenceLifelineProps) {
    const dimmed = useDiagramDecorationsDimmed(emphasisSurface, emphasis)

    return (
        <Box
            aria-hidden="true"
            data-diagram-connection-target={nodeId}
            sx={{
                height,
                left: x - LIFELINE_TARGET_WIDTH / 2,
                opacity: dimmed ? DIAGRAM_DIMMED_OPACITY : 1,
                position: 'absolute',
                top: y,
                width: LIFELINE_TARGET_WIDTH,
                zIndex: 1,
                '&::before': {
                    borderColor: 'divider', borderLeft: '1px dashed', content: '""', height: '100%',
                    left: LIFELINE_TARGET_WIDTH / 2, position: 'absolute', top: 0,
                },
            }}
        />
    )
}
