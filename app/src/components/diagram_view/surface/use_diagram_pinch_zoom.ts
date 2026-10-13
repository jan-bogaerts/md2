import { useCallback, useRef, type PointerEvent, type RefObject } from 'react'
import { MAXIMUM_DIAGRAM_ZOOM, MINIMUM_DIAGRAM_ZOOM } from '../../../services/diagrams/diagram_zoom'

interface ZoomStore {
    setViewportScale: (scale: number) => boolean
}

interface TouchPoint {
    x: number
    y: number
}

export interface DiagramZoomAnchor {
    clientX: number
    clientY: number
    diagramX: number
    diagramY: number
}

interface PinchGesture {
    initialDistance: number
    initialScale: number
    firstPointerId: number
    secondPointerId: number
    anchor: DiagramZoomAnchor
}

const MINIMUM_PINCH_DISTANCE = 1

function midpoint(first: TouchPoint, second: TouchPoint): TouchPoint {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function distance(first: TouchPoint, second: TouchPoint) {
    return Math.hypot(first.x - second.x, first.y - second.y)
}

/** Handles two touch pointers and exposes a temporary zoom anchor for scroll correction. */
export function useDiagramPinchZoom(
    scrollerRef: RefObject<HTMLElement | null>,
    store: ZoomStore,
    getViewportScaleSnapshot: () => number,
    cancelActiveGesture: () => void,
) {
    const touchPointsRef = useRef(new Map<number, TouchPoint>())
    const pinchRef = useRef<PinchGesture | null>(null)
    const anchorRef = useRef<DiagramZoomAnchor | null>(null)
    const suppressUntilReleaseRef = useRef(false)
    const suppressClickRef = useRef(false)

    const handlePointerDownCapture = useCallback((event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'touch') return
        const touchPoints = touchPointsRef.current
        if (touchPoints.size === 0) suppressClickRef.current = false
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (touchPoints.size !== 2 || pinchRef.current) {
            if (suppressUntilReleaseRef.current || touchPoints.size > 2) event.stopPropagation()
            return
        }

        const scroller = scrollerRef.current
        if (!scroller) throw new Error('Diagram pinch scroller is unavailable')
        const [firstPointerId, secondPointerId] = [...touchPoints.keys()]
        const first = touchPoints.get(firstPointerId) as TouchPoint
        const second = touchPoints.get(secondPointerId) as TouchPoint
        const center = midpoint(first, second)
        const bounds = scroller.getBoundingClientRect()
        const initialScale = getViewportScaleSnapshot()
        const anchor = {
            clientX: center.x,
            clientY: center.y,
            diagramX: (scroller.scrollLeft + center.x - bounds.left) / initialScale,
            diagramY: (scroller.scrollTop + center.y - bounds.top) / initialScale,
        }
        cancelActiveGesture()
        pinchRef.current = {
            anchor,
            firstPointerId,
            initialDistance: Math.max(distance(first, second), MINIMUM_PINCH_DISTANCE),
            initialScale,
            secondPointerId,
        }
        anchorRef.current = anchor
        suppressUntilReleaseRef.current = true
        suppressClickRef.current = true
        scroller.setPointerCapture?.(firstPointerId)
        scroller.setPointerCapture?.(secondPointerId)
        event.preventDefault()
        event.stopPropagation()
    }, [cancelActiveGesture, scrollerRef, getViewportScaleSnapshot])

    const handlePointerMoveCapture = useCallback((event: PointerEvent<HTMLElement>) => {
        const touchPoints = touchPointsRef.current
        if (event.pointerType !== 'touch' || !touchPoints.has(event.pointerId)) return
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const pinch = pinchRef.current
        if (!pinch) {
            if (suppressUntilReleaseRef.current) event.stopPropagation()
            return
        }
        const first = touchPoints.get(pinch.firstPointerId)
        const second = touchPoints.get(pinch.secondPointerId)
        if (!first || !second) return
        const scroller = scrollerRef.current
        if (!scroller) throw new Error('Diagram pinch scroller is unavailable')
        const center = midpoint(first, second)
        const bounds = scroller.getBoundingClientRect()
        const scale = Math.min(MAXIMUM_DIAGRAM_ZOOM, Math.max(
            MINIMUM_DIAGRAM_ZOOM,
            pinch.initialScale * distance(first, second) / pinch.initialDistance,
        ))
        const anchor = { ...pinch.anchor, clientX: center.x, clientY: center.y }
        anchorRef.current = anchor
        store.setViewportScale(scale)
        scroller.scrollLeft = anchor.diagramX * scale - (center.x - bounds.left)
        scroller.scrollTop = anchor.diagramY * scale - (center.y - bounds.top)
        event.preventDefault()
        event.stopPropagation()
    }, [scrollerRef, store])

    const endPointerCapture = useCallback((event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'touch' || !touchPointsRef.current.has(event.pointerId)) return
        const blocked = suppressUntilReleaseRef.current
        touchPointsRef.current.delete(event.pointerId)
        if (pinchRef.current) {
            pinchRef.current = null
            anchorRef.current = null
        }
        if (touchPointsRef.current.size === 0) suppressUntilReleaseRef.current = false
        const scroller = scrollerRef.current
        if (scroller?.hasPointerCapture?.(event.pointerId)) scroller.releasePointerCapture(event.pointerId)
        if (blocked) {
            event.preventDefault()
            event.stopPropagation()
        }
    }, [scrollerRef])

    const consumeSuppressedClick = useCallback(() => {
        const suppressed = suppressClickRef.current
        suppressClickRef.current = false
        return suppressed
    }, [])

    return { anchorRef, consumeSuppressedClick, endPointerCapture, handlePointerDownCapture, handlePointerMoveCapture }
}
