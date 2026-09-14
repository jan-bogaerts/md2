import { Box } from '@mui/material'
import {
    memo, useCallback, useEffect, useRef, useSyncExternalStore,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { DiagramRenderer } from './diagram_renderer'
import type { DiagramSelection } from './diagram_selection'
import { DiagramZoomSlider } from './diagram_zoom_slider'
import { useDiagramCtrlWheelZoom } from './use_diagram_ctrl_wheel_zoom'
import { usePreserveDiagramZoomCenter } from './use_preserve_diagram_zoom_center'
import { useDiagramSurfacePan } from './use_diagram_surface_pan'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { DiagramEmphasisExitButton } from './diagram_emphasis_exit_button'

/** Pans only from empty diagram background, so node, edge, and group activation keeps working. */
function isEmptyDiagramBackground(target: EventTarget | null) {
    if (!(target instanceof Element)) return false

    return !target.closest('[data-diagram-id]')
}

interface DiagramCurrentViewportProps {
    data: PositionedDiagramData
    emphasis?: DiagramEmphasisService
    onContextMenu?: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    onSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    service?: Pick<DiagramViewService,
        'getCurrentSelectionSnapshot'
        | 'getViewportScaleSnapshot'
        | 'setViewportScale'
        | 'subscribeCurrentSelection'
        | 'subscribeViewportScale'>
}

const CurrentDiagram = memo(DiagramRenderer)

function ignoreContextMenu() {}

/** Scrollable Current viewport with service-owned visual scale and fixed zoom control. */
export function DiagramCurrentViewport(props: DiagramCurrentViewportProps) {
    const {data, emphasis = diagramEmphasisService, onContextMenu = ignoreContextMenu} = props
    const {onSelect, service = diagramViewService} = props
    const scrollerRef = useRef<HTMLDivElement>(null)
    const scale = useSyncExternalStore(
        service.subscribeViewportScale,
        service.getViewportScaleSnapshot,
        service.getViewportScaleSnapshot,
    )
    usePreserveDiagramZoomCenter(scrollerRef, scale)
    useDiagramCtrlWheelZoom(scrollerRef, service)
    const canStartPan = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => isEmptyDiagramBackground(event.target),
        [],
    )
    const pan = useDiagramSurfacePan(scrollerRef, { canStartPan })
    const handleWindowKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape') return
        if (pan.cancelPan()) {
            event.preventDefault()

            return
        }
        if (emphasis.getTargetSnapshot()?.surface !== 'current') return
        event.preventDefault()
        emphasis.clear()
    }, [emphasis, pan])
    const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (!pan.consumeSuppressedClick()) return

        event.preventDefault()
        event.stopPropagation()
    }, [pan])
    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => { pan.beginPan(event) }, [pan])
    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => { pan.updatePan(event) }, [pan])
    const handlePointerUp = useCallback(() => { pan.completePan() }, [pan])
    const handlePointerCancel = useCallback(() => { pan.cancelPan() }, [pan])

    useEffect(() => {
        window.addEventListener('keydown', handleWindowKeyDown)

        return () => window.removeEventListener('keydown', handleWindowKeyDown)
    }, [handleWindowKeyDown])

    return (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            <Box
                aria-label="Current diagram scroller"
                onClickCapture={handleClickCapture}
                onPointerCancel={handlePointerCancel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                ref={scrollerRef}
                sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', p: 2 }}
            >
                <Box data-testid="current-diagram-zoom-surface" sx={{ transformOrigin: 'top left', zoom: scale }}>
                    <CurrentDiagram data={data} emphasis={emphasis} onContextMenu={onContextMenu} onSelect={onSelect} service={service} />
                </Box>
            </Box>
            <DiagramZoomSlider diagramIdentity="Current" store={service} />
            <DiagramEmphasisExitButton emphasis={emphasis} surface="current" />
        </Box>
    )
}
