import { Slider } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import { MAXIMUM_DIAGRAM_ZOOM, MINIMUM_DIAGRAM_ZOOM, DIAGRAM_ZOOM_STEP } from '../../services/diagrams/diagram_zoom'

export interface DiagramZoomStore {
    getViewportScaleSnapshot: () => number
    setViewportScale: (scale: number) => boolean
    subscribeViewportScale: (listener: () => void) => () => void
}

interface DiagramZoomSliderProps {
    diagramIdentity: 'Current' | 'New'
    store: DiagramZoomStore
}

// const ZOOM_MARKS = DIAGRAM_ZOOM_VALUES.map((value) => ({ value }))
const PERCENTAGE_MULTIPLIER = 100
const ZOOM_SLIDER_WIDTH = 200

function percentageText(value: number) {
    return `${Math.round(value * PERCENTAGE_MULTIPLIER)}%`
}

/** Floating direct-scale control shared by Current and New diagram viewports. */
export function DiagramZoomSlider({ diagramIdentity, store }: DiagramZoomSliderProps) {
    const scale = useSyncExternalStore(
        store.subscribeViewportScale,
        store.getViewportScaleSnapshot,
        store.getViewportScaleSnapshot,
    )
    const handleChange = useCallback((_event: Event, value: number | number[]) => {
        if (typeof value !== 'number') throw new Error('Diagram zoom slider requires one numeric value')
        store.setViewportScale(value)
    }, [store])

    return (
        <Slider
            aria-label={`${diagramIdentity} diagram zoom`}
            getAriaValueText={percentageText}
            // marks={ZOOM_MARKS}
            max={MAXIMUM_DIAGRAM_ZOOM}
            min={MINIMUM_DIAGRAM_ZOOM}
            onChange={handleChange}
            step={DIAGRAM_ZOOM_STEP}
            sx={{
                bottom: 2,
                left: 2,
                position: 'absolute',
                width: ZOOM_SLIDER_WIDTH,
                zIndex: 'tooltip',
            }}
            value={scale}
            valueLabelDisplay="auto"
            valueLabelFormat={percentageText}
        />
    )
}
