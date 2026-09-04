import { Box } from '@mui/material'
import {
    memo, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import {
    diagramResizeService,
    type DiagramResizeDirection,
    type DiagramResizeService,
} from '../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectableObjectKind, type DiagramSelectionIdentity, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { convertClientToDiagramCoordinates } from './diagram_coordinate_conversion'
import { EditableDiagram } from './editable_diagram'

interface DiagramZoomViewportProps {
    geometry?: DiagramGeometryService
    movement?: DiagramMoveService
    resize?: DiagramResizeService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

const NewDiagram = memo(EditableDiagram)
const KEYBOARD_RESIZE_STEP = 4

interface DiagramResizeTarget {
    direction: DiagramResizeDirection
    identity: DiagramSelectionIdentity
}

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

function diagramResizeTargetFromTarget(target: EventTarget | null): DiagramResizeTarget | null {
    if (!(target instanceof Element)) return null

    const handle = target.closest('[data-diagram-resize-handle]') as HTMLElement | null
    const direction = handle?.dataset.diagramResizeDirection
    const objectId = handle?.dataset.diagramResizeObjectId
    const objectKind = handle?.dataset.diagramResizeObjectKind
    const directions: DiagramResizeDirection[] = [
        'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
    ]
    if (!objectId || (objectKind !== 'group' && objectKind !== 'node')
        || !directions.includes(direction as DiagramResizeDirection)) return null

    return { direction: direction as DiagramResizeDirection, identity: { objectId, objectKind } }
}

/** Scrollable New viewport whose visual scale leaves canonical diagram coordinates untouched. */
export function DiagramZoomViewport({
    geometry = diagramGeometryService,
    movement = diagramMoveService,
    resize = diagramResizeService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramZoomViewportProps) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const activePointerGestureRef = useRef<'move' | 'resize' | null>(null)
    const completingGestureRef = useRef(false)
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
        const point = pointerDiagramPoint(event.clientX, event.clientY)
        const resizeTarget = diagramResizeTargetFromTarget(event.target)
        const identity = resizeTarget ? null : diagramIdentityFromTarget(event.target)
        const gesture = resizeTarget && resize.beginResize(resizeTarget.identity, resizeTarget.direction, point)
            ? 'resize'
            : identity && movement.beginMove(identity, point)
                ? 'move'
                : null
        if (!gesture) return

        activePointerIdRef.current = event.pointerId
        activePointerGestureRef.current = gesture
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [movement, pointerDiagramPoint, resize])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        const point = pointerDiagramPoint(event.clientX, event.clientY)
        const changed = activePointerGestureRef.current === 'resize'
            ? resize.updateResize(point)
            : movement.updateMove(point)
        if (changed) suppressClickRef.current = true
    }, [movement, pointerDiagramPoint, resize])

    const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        completingGestureRef.current = true
        if (activePointerGestureRef.current === 'resize') resize.completeResize()
        else movement.completeMove()
        completingGestureRef.current = false
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [movement, releaseActivePointer, resize])

    const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [movement, releaseActivePointer, resize])

    const handleLostPointerCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return

        activePointerIdRef.current = null
        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
    }, [movement, resize])

    const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) return

        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
    }, [])

    const handleWindowKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape' || activePointerGestureRef.current === null) return

        event.preventDefault()
        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [movement, releaseActivePointer, resize])

    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (activePointerGestureRef.current !== null || !event.key.startsWith('Arrow')) return
        const resizeTarget = diagramResizeTargetFromTarget(event.target)
        if (!resizeTarget) return

        const horizontal = resizeTarget.direction.includes('east') || resizeTarget.direction.includes('west')
        const vertical = resizeTarget.direction.includes('north') || resizeTarget.direction.includes('south')
        const delta = {
            x: horizontal ? (event.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : event.key === 'ArrowRight' ? KEYBOARD_RESIZE_STEP : 0) : 0,
            y: vertical ? (event.key === 'ArrowUp' ? -KEYBOARD_RESIZE_STEP : event.key === 'ArrowDown' ? KEYBOARD_RESIZE_STEP : 0) : 0,
        }
        if (delta.x === 0 && delta.y === 0) return

        event.preventDefault()
        const start = { x: 0, y: 0 }
        if (!resize.beginResize(resizeTarget.identity, resizeTarget.direction, start)) return
        resize.updateResize(delta)
        resize.completeResize()
    }, [resize])

    const handleTransientGestureChanged = useCallback(() => {
        if (
            completingGestureRef.current
            || activePointerIdRef.current === null
            || session.getTransientGestureSnapshot() === activePointerGestureRef.current
        ) return

        suppressClickRef.current = false
        activePointerGestureRef.current = null
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
            onKeyDown={handleKeyDown}
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
