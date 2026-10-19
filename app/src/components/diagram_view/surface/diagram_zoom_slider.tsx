import { Slider, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import { MAXIMUM_DIAGRAM_ZOOM, MINIMUM_DIAGRAM_ZOOM, DIAGRAM_ZOOM_STEP } from '../../../services/diagrams/diagram_zoom'

export interface DiagramZoomStore {
    setViewportScale: (scale: number) => boolean
}

export interface DiagramZoomReader {
    getViewportScaleSnapshot: () => number
    subscribeViewportScale: (listener: () => void) => () => void
}

interface DiagramZoomSliderProps {
    diagramIdentity: 'Current' | 'New'
    reader: DiagramZoomReader
    store: DiagramZoomStore
}

// const ZOOM_MARKS = DIAGRAM_ZOOM_VALUES.map((value) => ({ value }))
const PERCENTAGE_MULTIPLIER = 100
const ZOOM_SLIDER_WIDTH = 200

function percentageText(value: number) {
    return `${Math.round(value * PERCENTAGE_MULTIPLIER)}%`
}

/** Floating direct-scale control shared by Current and New diagram viewports. */
export function DiagramZoomSlider({ diagramIdentity, reader, store }: DiagramZoomSliderProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const scale = useSyncExternalStore(
        reader.subscribeViewportScale,
        reader.getViewportScaleSnapshot,
        reader.getViewportScaleSnapshot,
    )
    const handleChange = useCallback((_event: Event, value: number | number[]) => {
        if (typeof value !== 'number') throw new Error('Diagram zoom slider requires one numeric value')
        store.setViewportScale(value)
    }, [store])
    if (isMobile) return null

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
                zIndex: 1,
            }}
            value={scale}
            valueLabelDisplay="auto"
            valueLabelFormat={percentageText}
        />
    )
}
