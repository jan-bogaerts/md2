import { Box } from '@mui/material'
import { memo, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { EditableDiagram } from './editable_diagram'

interface DiagramZoomViewportProps {
    geometry?: DiagramGeometryService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

const NewDiagram = memo(EditableDiagram)

function scaledCenterOffset(offset: number, viewportSize: number, previousScale: number, scale: number) {
    return (offset + viewportSize / 2) * scale / previousScale - viewportSize / 2
}

/** Scrollable New viewport whose visual scale leaves canonical diagram coordinates untouched. */
export function DiagramZoomViewport({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramZoomViewportProps) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const scale = useSyncExternalStore(
        session.subscribeViewportScale,
        session.getViewportScaleSnapshot,
        session.getViewportScaleSnapshot,
    )
    const previousScaleRef = useRef(scale)

    useLayoutEffect(() => {
        const previousScale = previousScaleRef.current
        previousScaleRef.current = scale
        if (previousScale === scale) return

        const scroller = scrollerRef.current
        if (!scroller) return

        scroller.scrollLeft = scaledCenterOffset(scroller.scrollLeft, scroller.clientWidth, previousScale, scale)
        scroller.scrollTop = scaledCenterOffset(scroller.scrollTop, scroller.clientHeight, previousScale, scale)
    }, [scale])

    return (
        <Box
            aria-label="New diagram scroller"
            ref={scrollerRef}
            sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, pb: 2, pt: 1 }}
        >
            <Box data-testid="new-diagram-zoom-surface" sx={{ transformOrigin: 'top left', zoom: scale }}>
                <NewDiagram geometry={geometry} selection={selection} session={session} />
            </Box>
        </Box>
    )
}
