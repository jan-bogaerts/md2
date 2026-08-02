import { Box } from '@mui/material'
import { useRef } from 'react'
import type { PointerEvent, RefObject } from 'react'

const SCROLL_ZONE_WIDTH = 20

interface CardViewScrollZonesProps {
    scrollContainerRef: RefObject<HTMLDivElement | null>
}

interface ScrollGesture {
    clientY: number
    pointerId: number
}

interface CardViewScrollZoneProps extends CardViewScrollZonesProps {
    edge: 'left' | 'right'
}

/** Transparent mobile edge zone that converts pointer movement into card-column scrolling. */
function CardViewScrollZone(props: CardViewScrollZoneProps) {
    const { edge, scrollContainerRef } = props
    const gestureRef = useRef<ScrollGesture | null>(null)

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        gestureRef.current = { clientY: event.clientY, pointerId: event.pointerId }
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current
        if (!gesture || gesture.pointerId !== event.pointerId) return

        const scrollContainer = scrollContainerRef.current
        if (!scrollContainer) throw new Error('Missing card columns scroll container')

        scrollContainer.scrollTop += gesture.clientY - event.clientY
        gesture.clientY = event.clientY
    }

    const clearGesture = (event: PointerEvent<HTMLDivElement>) => {
        if (gestureRef.current?.pointerId !== event.pointerId) return

        gestureRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    return (
        <Box
            aria-hidden
            data-testid={`${edge}-card-scroll-zone`}
            onPointerCancel={clearGesture}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearGesture}
            sx={{
                bottom: 0,
                position: 'absolute',
                [edge]: 0,
                top: 0,
                touchAction: 'none',
                width: SCROLL_ZONE_WIDTH,
                zIndex: 2,
            }}
        />
    )
}

/** Mobile-only pair of card-view edge scroll zones. */
export function CardViewScrollZones(props: CardViewScrollZonesProps) {
    return (
        <>
            <CardViewScrollZone edge="left" {...props} />
            <CardViewScrollZone edge="right" {...props} />
        </>
    )
}
