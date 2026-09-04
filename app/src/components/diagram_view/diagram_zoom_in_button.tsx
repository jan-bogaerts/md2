import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService,
    MAXIMUM_DIAGRAM_ZOOM,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramZoomInButtonProps {
    session?: Pick<
        DiagramEditSessionService,
        'getViewportScaleSnapshot' | 'subscribeViewportScale' | 'zoomIn'
    >
}

/** One-shot Zoom In control bound only to New viewport scale. */
export function DiagramZoomInButton({ session = diagramEditSessionService }: DiagramZoomInButtonProps) {
    const scale = useSyncExternalStore(
        session.subscribeViewportScale,
        session.getViewportScaleSnapshot,
        session.getViewportScaleSnapshot,
    )
    const handleZoomIn = useCallback(() => { session.zoomIn() }, [session])

    return (
        <DiagramToolboxActionButton
            disabled={scale >= MAXIMUM_DIAGRAM_ZOOM}
            label="Zoom in"
            onActivate={handleZoomIn}
            tooltip="Zoom in"
        />
    )
}
