import { Box } from '@mui/material'
import {
    memo, useCallback, useEffect, useRef, useSyncExternalStore,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../../services/diagrams/diagram_edge_drawing_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../../services/diagrams/diagram_geometry_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../../services/diagrams/diagram_group_drawing_service'
import { diagramMoveService, type DiagramMoveService } from '../../../services/diagrams/diagram_move_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../../services/diagrams/diagram_node_placement_service'
import {
    diagramResizeService,
    type DiagramResizeDirection,
    type DiagramResizeService,
} from '../../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectableObjectKind, type DiagramSelectionIdentity, type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service'
import { diagramViewService, type DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../../services/diagrams/diagram_emphasis_service'
import { convertClientToDiagramCoordinates } from '../editing/diagram_coordinate_conversion'
import { EditableDiagram } from '../editing/editable_diagram'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from '../review/diagram_change_review_service'
import { useDiagramCtrlWheelZoom } from '../editing/use_diagram_ctrl_wheel_zoom'
import { usePreserveDiagramZoomCenter } from './use_preserve_diagram_zoom_center'
import { useDiagramSurfacePan } from '../editing/use_diagram_surface_pan'
import { useActiveDiagramTool } from '../editing/use_diagram_tool'

interface DiagramZoomViewportProps {
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    emphasis?: DiagramEmphasisService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    movement?: DiagramMoveService
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
    viewService?: DiagramViewService
}

const NewDiagram = memo(EditableDiagram)
const KEYBOARD_RESIZE_STEP = 4

interface DiagramResizeTarget {
    direction: DiagramResizeDirection
    identity: DiagramSelectionIdentity
}

function diagramIdentityFromTarget(target: EventTarget | null): DiagramSelectionIdentity | null {
    if (!(target instanceof Element)) return null

    const objectElement = target.closest('[data-diagram-id][data-diagram-kind]') as HTMLElement | null
    const objectId = objectElement?.dataset.diagramId
    const objectKind = objectElement?.dataset.diagramKind
    if (!objectId || (objectKind !== 'edge' && objectKind !== 'group' && objectKind !== 'node')) return null

    return { objectId, objectKind: objectKind as DiagramSelectableObjectKind }
}

function diagramConnectionNodeIdFromTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return null

    const node = target.closest('[data-diagram-connection-target]') as HTMLElement | null

    return node?.dataset.diagramConnectionTarget ?? null
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
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    emphasis = diagramEmphasisService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    movement = diagramMoveService,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
    viewService = diagramViewService,
}: DiagramZoomViewportProps) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const activePointerGestureRef = useRef<'group' | 'move' | 'pan' | 'placement' | 'resize' | null>(null)
    const completingGestureRef = useRef(false)
    const suppressClickRef = useRef(false)
    const scale = useSyncExternalStore(
        session.subscribeViewportScale,
        session.getViewportScaleSnapshot,
        session.getViewportScaleSnapshot,
    )
    usePreserveDiagramZoomCenter(scrollerRef, scale)
    useDiagramCtrlWheelZoom(scrollerRef, session)
    const panToolActive = useActiveDiagramTool(session, 'pan')
    const canStartPan = useCallback(() => session.getActiveToolSnapshot() === 'pan', [session])
    const beginPanGesture = useCallback(() => session.beginTransientGesture('pan'), [session])
    const completePanGesture = useCallback(() => session.completeTransientGesture(), [session])
    const pan = useDiagramSurfacePan(scrollerRef, {
        canStartPan,
        enabled: panToolActive,
        onPanCancel: completePanGesture,
        onPanComplete: completePanGesture,
        onPanStart: beginPanGesture,
        preventDefaultForTouch: true,
    })
    const endPanGesture = useCallback(() => {
        activePointerGestureRef.current = null
        activePointerIdRef.current = null
    }, [])

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
        if (session.getActiveToolSnapshot() === 'pan') {
            if (!pan.beginPan(event)) return

            activePointerIdRef.current = event.pointerId
            activePointerGestureRef.current = 'pan'

            return
        }
        const point = pointerDiagramPoint(event.clientX, event.clientY)
        if (drawing.isDrawingActive()) {
            event.preventDefault()
            suppressClickRef.current = true
            const nodeId = diagramConnectionNodeIdFromTarget(event.target)
            if (drawing.hasSource()) drawing.completeTarget(nodeId, point)
            else if (nodeId) drawing.beginSource(nodeId, point)

            return
        }
        if (placement.isPlacementActive()) {
            event.preventDefault()
            placement.updatePreview(point)
            activePointerIdRef.current = event.pointerId
            activePointerGestureRef.current = 'placement'
            event.currentTarget.setPointerCapture?.(event.pointerId)

            return
        }
        if (groupDrawing.isDrawingActive()) {
            event.preventDefault()
            if (!groupDrawing.beginDrawing(point)) return

            activePointerIdRef.current = event.pointerId
            activePointerGestureRef.current = 'group'
            event.currentTarget.setPointerCapture?.(event.pointerId)

            return
        }
        const resizeTarget = diagramResizeTargetFromTarget(event.target)
        const identity = resizeTarget ? null : diagramIdentityFromTarget(event.target)
        const gesture = resizeTarget && resize.beginResize(resizeTarget.identity, resizeTarget.direction, point)
            ? 'resize'
            : identity && movement.beginMove(identity, point)
                ? 'move'
                : null
        if (!gesture) return

        event.preventDefault()
        activePointerIdRef.current = event.pointerId
        activePointerGestureRef.current = gesture
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [drawing, groupDrawing, movement, pan, placement, pointerDiagramPoint, resize, session])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current === null) {
            if (drawing.isDrawingActive() && drawing.hasSource()) {
                drawing.updatePreview(pointerDiagramPoint(event.clientX, event.clientY), diagramConnectionNodeIdFromTarget(event.target))

                return
            }
            if (placement.isPlacementActive()) placement.updatePreview(pointerDiagramPoint(event.clientX, event.clientY))

            return
        }
        if (activePointerIdRef.current !== event.pointerId) return
        if (activePointerGestureRef.current === 'pan') {
            pan.updatePan(event)

            return
        }

        const point = pointerDiagramPoint(event.clientX, event.clientY)
        if (activePointerGestureRef.current === 'placement') {
            placement.updatePreview(point)

            return
        }
        if (activePointerGestureRef.current === 'group') {
            groupDrawing.updateDrawing(point)

            return
        }
        const changed = activePointerGestureRef.current === 'resize'
            ? resize.updateResize(point)
            : movement.updateMove(point)
        if (changed) suppressClickRef.current = true
    }, [drawing, groupDrawing, movement, pan, placement, pointerDiagramPoint, resize])

    const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return
        if (activePointerGestureRef.current === 'pan') {
            endPanGesture()
            pan.completePan()

            return
        }

        completingGestureRef.current = true
        if (activePointerGestureRef.current === 'placement') {
            suppressClickRef.current = true
            placement.place(pointerDiagramPoint(event.clientX, event.clientY))
        } else if (activePointerGestureRef.current === 'group') {
            suppressClickRef.current = true
            groupDrawing.finishDrawing(pointerDiagramPoint(event.clientX, event.clientY))
        } else if (activePointerGestureRef.current === 'resize') resize.completeResize()
        else movement.completeMove()
        completingGestureRef.current = false
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [endPanGesture, groupDrawing, movement, pan, placement, pointerDiagramPoint, releaseActivePointer, resize])

    const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return
        if (activePointerGestureRef.current === 'pan') {
            endPanGesture()
            pan.cancelPan()

            return
        }

        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'placement') placement.cancelPlacement()
        else if (activePointerGestureRef.current === 'group') groupDrawing.cancelDrawing()
        else if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [endPanGesture, groupDrawing, movement, pan, placement, releaseActivePointer, resize])

    const handleLostPointerCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return
        if (activePointerGestureRef.current === 'pan') {
            endPanGesture()
            pan.cancelPan()

            return
        }

        activePointerIdRef.current = null
        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'placement') placement.cancelPlacement()
        else if (activePointerGestureRef.current === 'group') groupDrawing.cancelDrawing()
        else if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
    }, [endPanGesture, groupDrawing, movement, pan, placement, resize])

    const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        const panSuppressed = pan.consumeSuppressedClick()
        if (!panSuppressed && !suppressClickRef.current) return

        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
    }, [pan])

    const handleWindowKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape') return
        if (drawing.isDrawingActive()) {
            event.preventDefault()
            suppressClickRef.current = false
            drawing.cancelDrawing()

            return
        }
        if (placement.isPlacementActive()) {
            event.preventDefault()
            suppressClickRef.current = false
            placement.cancelPlacement()
            activePointerGestureRef.current = null
            releaseActivePointer()

            return
        }
        if (groupDrawing.isDrawingActive()) {
            event.preventDefault()
            suppressClickRef.current = false
            groupDrawing.cancelDrawing()
            activePointerGestureRef.current = null
            releaseActivePointer()

            return
        }
        if (activePointerGestureRef.current === 'pan') {
            event.preventDefault()
            endPanGesture()
            pan.cancelPan()

            return
        }
        if (activePointerGestureRef.current === null) {
            if (emphasis.getTargetSnapshot()?.surface !== 'new') return
            event.preventDefault()
            emphasis.clear()

            return
        }

        event.preventDefault()
        suppressClickRef.current = false
        if (activePointerGestureRef.current === 'resize') resize.cancelResize()
        else movement.cancelMove()
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [drawing, emphasis, endPanGesture, groupDrawing, movement, pan, placement, releaseActivePointer, resize])

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
        if (activePointerGestureRef.current === 'pan') {
            endPanGesture()
            pan.cancelPan()

            return
        }

        suppressClickRef.current = false
        activePointerGestureRef.current = null
        releaseActivePointer()
    }, [endPanGesture, pan, releaseActivePointer, session])

    useEffect(() => {
        window.addEventListener('keydown', handleWindowKeyDown)

        return () => window.removeEventListener('keydown', handleWindowKeyDown)
    }, [handleWindowKeyDown])

    useEffect(
        () => session.subscribeTransientGesture(handleTransientGestureChanged),
        [handleTransientGestureChanged, session],
    )

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
            sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', px: 2, pb: 2, pt: 1, touchAction: panToolActive ? 'none' : 'auto' }}
        >
            <Box data-testid="new-diagram-zoom-surface" sx={{ transformOrigin: 'top left', zoom: scale }}>
                <NewDiagram
                    details={details}
                    drawing={drawing}
                    emphasis={emphasis}
                    geometry={geometry}
                    groupDrawing={groupDrawing}
                    placement={placement}
                    review={review}
                    selection={selection}
                    session={session}
                    viewService={viewService}
                />
            </Box>
        </Box>
    )
}
