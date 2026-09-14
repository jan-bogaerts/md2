import { IconButton, Tooltip } from '@mui/material'
import Close from '@mui/icons-material/Close'
import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEmphasisService, type DiagramEmphasisService, type DiagramSurface,
} from '../../services/diagrams/diagram_emphasis_service'

interface DiagramEmphasisExitButtonProps {
    emphasis?: Pick<DiagramEmphasisService, 'clear' | 'getTargetSnapshot' | 'subscribeTarget'>
    surface: DiagramSurface
}

/** Fixed viewport control for leaving emphasis mode. */
export function DiagramEmphasisExitButton({ emphasis = diagramEmphasisService, surface }: DiagramEmphasisExitButtonProps) {
    const target = useSyncExternalStore(emphasis.subscribeTarget, emphasis.getTargetSnapshot, emphasis.getTargetSnapshot)
    const handleExit = useCallback(() => emphasis.clear(), [emphasis])
    if (target?.surface !== surface) return null

    return (
        <Tooltip title="Exit emphasis">
            <IconButton
                aria-label="Exit emphasis"
                onClick={handleExit}
                size="small"
                sx={{ bgcolor: 'background.paper', position: 'absolute', right: 8, top: 8, zIndex: 5 }}
            >
                <Close fontSize="small" />
            </IconButton>
        </Tooltip>
    )
}
