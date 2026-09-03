import { Box } from '@mui/material'
import type { PositionedSequenceActivation } from '../../services/diagrams/diagram_layout'

interface SequenceActivationProps {
    activation: PositionedSequenceActivation
}

/** One positioned sequence activation interval. */
export function SequenceActivation({ activation }: SequenceActivationProps) {
    return (
        <Box
            aria-hidden="true"
            sx={{
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'text.secondary', height: activation.height,
                left: activation.x, position: 'absolute', top: activation.y, width: activation.width, zIndex: 1,
            }}
        />
    )
}
