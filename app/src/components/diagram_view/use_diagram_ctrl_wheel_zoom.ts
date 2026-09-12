import { useEffect, type RefObject } from 'react'
import { DIAGRAM_ZOOM_VALUES } from '../../services/diagrams/diagram_zoom'

interface DiagramZoomStore {
    getViewportScaleSnapshot: () => number
    setViewportScale: (scale: number) => boolean
}

function nextDiagramZoom(scale: number, deltaY: number) {
    const scaleIndex = DIAGRAM_ZOOM_VALUES.indexOf(scale)
    if (scaleIndex < 0) throw new Error(`Unsupported diagram zoom scale: ${scale}`)

    const direction = deltaY < 0 ? 1 : -1
    const nextIndex = Math.min(Math.max(scaleIndex + direction, 0), DIAGRAM_ZOOM_VALUES.length - 1)

    return DIAGRAM_ZOOM_VALUES[nextIndex]
}

/** Changes service-owned diagram zoom by one supported step for each Ctrl-wheel event. */
export function useDiagramCtrlWheelZoom(
    scrollerRef: RefObject<HTMLElement | null>,
    store: DiagramZoomStore,
) {
    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) return

        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey || event.deltaY === 0) return

            event.preventDefault()
            store.setViewportScale(nextDiagramZoom(store.getViewportScaleSnapshot(), event.deltaY))
        }
        scroller.addEventListener('wheel', handleWheel, { passive: false })

        return () => scroller.removeEventListener('wheel', handleWheel)
    }, [scrollerRef, store])
}
