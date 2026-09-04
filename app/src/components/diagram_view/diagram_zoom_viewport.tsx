import { Box } from '@mui/material'
import {
    memo, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import {
    diagramSelectionService, type DiagramSelectableObjectKind, type DiagramSelectionIdentity, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { convertClientToDiagramCoordinates } from './diagram_coordinate_conversion'
import { EditableDiagram } from './editable_diagram'

interface DiagramZoomViewportProps {
    geometry?: DiagramGeometryService
    movement?: DiagramMoveService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

const NewDiagram = memo(EditableDiagram)

function scaledCenterOffset(offset: number, viewportSize: number, previousScale: number, scale: number) {
    return (offset + viewportSize / 2) * scale / previousScale - viewportSize / 2
}

function diagramIdentityFromTarget(target: EventTarget | null): DiagramSelectionIdentity | null {
    if (!(target instanceof Element)) return null

    const objectElement = target.closest('[data-diagram-id][data-diagram-kind]') as HTMLElement | null
    const objectId = objectElement?.dataset.diagramId
    const objectKind = objectElement?.dataset.diagramKind
    if (!objectId || (objectKind !== 'edge' && objectKind !== 'group' && objectKind !== 'node')) return null

    return { objectId, objectKind: objectKind as DiagramSelectableObjectKind }
}

/** Scrollable New viewport whose visual scale leaves canonical diagram coordinates untouched. */
export function DiagramZoomViewport({
    geometry = diagramGeometryService,
    movement = diagramMoveService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramZoomViewportProps) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const completingMoveRef = useRef(false)
    const suppressClickRef = useRef(false)
    const scale = useSyncExternalStore(
        session.subscribeViewportScale,
        session.getViewportScaleSnapshot,
        session.getViewportScaleSnapshot,
    )
    const previousScaleRef = useRef(scale)

    const pointerDiagramPoint = useCallback((clientX: number, clientY: number) => {
        const scroller = scrollerRef.current
        if (!scroller) throw new Error('Diagram move viewport is unavailable')

        return convertClientToDiagramCoordinates(
            { clientX, clientY },
            {
                bounds: scroller.getBoundingClientRect(),
                scrollLeft: scroller.scrollLeft,
                scrollTop: scroller.scrollTop,
            },
            session.getViewportScaleSnapshot(),
        ).diagramPoint
    }, [session])

    const releaseActivePointer = useCallback(() => {
        const pointerId = activePointerIdRef.current
        activePointerIdRef.current = null
        if (pointerId === null) return

        scrollerRef.current?.releasePointerCapture?.(pointerId)
    }, [])

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== null || event.button !== 0 || event.isPrimary === false) return
        const identity = diagramIdentityFromTarget(event.target)
        if (!identity) return
        if (!movement.beginMove(identity, pointerDiagramPoint(event.clientX, event.clientY))) return

        activePointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [movement, pointerDiagramPoint])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        if (movement.updateMove(pointerDiagramPoint(event.clientX, event.clientY))) suppressClickRef.current = true
    }, [movement, pointerDiagramPoint])

    const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        completingMoveRef.current = true
        movement.completeMove()
        completingMoveRef.current = false
        releaseActivePointer()
    }, [movement, releaseActivePointer])

    const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        suppressClickRef.current = false
        movement.cancelMove()
        releaseActivePointer()
    }, [movement, releaseActivePointer])

    const handleLostPointerCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        activePointerIdRef.current = null
        suppressClickRef.current = false
        movement.cancelMove()
    }, [movement])

    const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) return

        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
    }, [])

    const handleWindowKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape' || !movement.getMoveActiveSnapshot()) return

        event.preventDefault()
        suppressClickRef.current = false
        movement.cancelMove()
        releaseActivePointer()
    }, [movement, releaseActivePointer])

    const handleTransientGestureChanged = useCallback(() => {
        if (
            completingMoveRef.current
            || activePointerIdRef.current === null
            || session.getTransientGestureSnapshot() === 'move'
        ) return

        suppressClickRef.current = false
        releaseActivePointer()
    }, [releaseActivePointer, session])

    useEffect(() => {
        window.addEventListener('keydown', handleWindowKeyDown)

        return () => window.removeEventListener('keydown', handleWindowKeyDown)
    }, [handleWindowKeyDown])

    useEffect(
        () => session.subscribeTransientGesture(handleTransientGestureChanged),
        [handleTransientGestureChanged, session],
    )

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
            onClickCapture={handleClickCapture}
            onLostPointerCapture={handleLostPointerCapture}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={scrollerRef}
            sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, pb: 2, pt: 1 }}
        >
            <Box data-testid="new-diagram-zoom-surface" sx={{ transformOrigin: 'top left', zoom: scale }}>
                <NewDiagram geometry={geometry} selection={selection} session={session} />
            </Box>
        </Box>
    )
}
