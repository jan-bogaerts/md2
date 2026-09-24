import {
    useCallback, useLayoutEffect, useMemo, useRef,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react'

/** Pointer travel, in viewport pixels, above which a pan swallows its trailing click. */
export const PAN_DRAG_THRESHOLD = 3

interface DiagramSurfacePanGesture {
    moved: boolean
    pointerId: number
    pointerX: number
    pointerY: number
    scrollLeft: number
    scrollTop: number
}

export interface DiagramSurfacePanOptions {
    /** Decides whether one pointer down may start a pan; the caller owns tool and target rules. */
    canStartPan: (event: ReactPointerEvent<HTMLElement>) => boolean
    /** False drops the grab cursor, for viewports where panning is not offered right now. */
    enabled?: boolean
    onPanCancel?: () => void
    onPanComplete?: () => void
    onPanStart?: () => void
    /** True suppresses the browser's native touch scrolling while a pan runs. */
    preventDefaultForTouch?: boolean
}

export interface DiagramSurfacePan {
    beginPan: (event: ReactPointerEvent<HTMLElement>) => boolean
    cancelPan: () => boolean
    completePan: () => boolean
    /** Reads and clears the pending click suppression left by a pan that passed the drag threshold. */
    consumeSuppressedClick: () => boolean
    isPanActive: () => boolean
    updatePan: (event: ReactPointerEvent<HTMLElement>) => boolean
}

/**
 * Drags a scroll container's content with the pointer. It writes `scrollLeft` and `scrollTop` straight onto the
 * element and keeps every gesture value in refs, so a pan repaints nothing in React and no diagram coordinate or
 * zoom scale enters the calculation: the deltas are viewport pixels.
 */
export function useDiagramSurfacePan(
    scrollerRef: RefObject<HTMLElement | null>,
    {
        canStartPan,
        enabled = true,
        onPanCancel,
        onPanComplete,
        onPanStart,
        preventDefaultForTouch = false,
    }: DiagramSurfacePanOptions,
): DiagramSurfacePan {
    const gestureRef = useRef<DiagramSurfacePanGesture | null>(null)
    const suppressClickRef = useRef(false)
    const idleCursor = enabled ? 'grab' : ''

    useLayoutEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller || gestureRef.current) return

        scroller.style.cursor = idleCursor
    }, [idleCursor, scrollerRef])

    const endGesture = useCallback((gesture: DiagramSurfacePanGesture) => {
        const scroller = scrollerRef.current
        gestureRef.current = null
        if (!scroller) return

        scroller.style.cursor = idleCursor
        if (scroller.hasPointerCapture?.(gesture.pointerId)) scroller.releasePointerCapture?.(gesture.pointerId)
    }, [idleCursor, scrollerRef])

    const beginPan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        const scroller = scrollerRef.current
        if (gestureRef.current || !scroller || event.button !== 0 || event.isPrimary === false) return false
        if (!canStartPan(event)) return false
        if (event.pointerType !== 'touch' || preventDefaultForTouch) event.preventDefault()

        suppressClickRef.current = false
        gestureRef.current = {
            moved: false,
            pointerId: event.pointerId,
            pointerX: event.clientX,
            pointerY: event.clientY,
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
        }
        scroller.style.cursor = 'grabbing'
        scroller.setPointerCapture?.(event.pointerId)
        onPanStart?.()

        return true
    }, [canStartPan, onPanStart, preventDefaultForTouch, scrollerRef])

    const updatePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current
        const scroller = scrollerRef.current
        if (!gesture || gesture.pointerId !== event.pointerId || !scroller) return false

        const horizontalDelta = event.clientX - gesture.pointerX
        const verticalDelta = event.clientY - gesture.pointerY
        if (Math.abs(horizontalDelta) >= PAN_DRAG_THRESHOLD || Math.abs(verticalDelta) >= PAN_DRAG_THRESHOLD) {
            gesture.moved = true
        }
        scroller.scrollLeft = gesture.scrollLeft - horizontalDelta
        scroller.scrollTop = gesture.scrollTop - verticalDelta

        return true
    }, [scrollerRef])

    const completePan = useCallback(() => {
        const gesture = gestureRef.current
        if (!gesture) return false

        suppressClickRef.current = gesture.moved
        endGesture(gesture)
        onPanComplete?.()

        return true
    }, [endGesture, onPanComplete])

    const cancelPan = useCallback(() => {
        const gesture = gestureRef.current
        const scroller = scrollerRef.current
        if (!gesture) return false

        if (scroller) {
            scroller.scrollLeft = gesture.scrollLeft
            scroller.scrollTop = gesture.scrollTop
        }
        suppressClickRef.current = false
        endGesture(gesture)
        onPanCancel?.()

        return true
    }, [endGesture, onPanCancel, scrollerRef])

    const consumeSuppressedClick = useCallback(() => {
        const suppressed = suppressClickRef.current
        suppressClickRef.current = false

        return suppressed
    }, [])

    const isPanActive = useCallback(() => !!gestureRef.current, [])

    return useMemo(() => ({
        beginPan,
        cancelPan,
        completePan,
        consumeSuppressedClick,
        isPanActive,
        updatePan,
    }), [beginPan, cancelPan, completePan, consumeSuppressedClick, isPanActive, updatePan])
}
