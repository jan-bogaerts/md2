import { useLayoutEffect, useRef, type RefObject } from 'react'

function scaledCenterOffset(offset: number, viewportSize: number, previousScale: number, scale: number) {
    return (offset + viewportSize / 2) * scale / previousScale - viewportSize / 2
}

/** Keeps viewport's visible diagram center stable across visual scale changes. */
export function usePreserveDiagramZoomCenter(scrollerRef: RefObject<HTMLElement | null>, scale: number) {
    const previousScaleRef = useRef(scale)

    useLayoutEffect(() => {
        const previousScale = previousScaleRef.current
        previousScaleRef.current = scale
        if (previousScale === scale) return

        const scroller = scrollerRef.current
        if (!scroller) return

        scroller.scrollLeft = scaledCenterOffset(scroller.scrollLeft, scroller.clientWidth, previousScale, scale)
        scroller.scrollTop = scaledCenterOffset(scroller.scrollTop, scroller.clientHeight, previousScale, scale)
    }, [scale, scrollerRef])
}
