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
    const getCanZoomInSnapshot = useCallback(
        () => session.getViewportScaleSnapshot() < MAXIMUM_DIAGRAM_ZOOM,
        [session],
    )
    const canZoomIn = useSyncExternalStore(
        session.subscribeViewportScale,
        getCanZoomInSnapshot,
        getCanZoomInSnapshot,
    )
    const handleZoomIn = useCallback(() => { session.zoomIn() }, [session])

    return (
        <DiagramToolboxActionButton
            disabled={!canZoomIn}
            label="Zoom in"
            onActivate={handleZoomIn}
            tooltip="Zoom in"
        />
    )
}
