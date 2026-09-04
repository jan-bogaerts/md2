import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService,
    MINIMUM_DIAGRAM_ZOOM,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramZoomOutButtonProps {
    session?: Pick<
        DiagramEditSessionService,
        'getViewportScaleSnapshot' | 'subscribeViewportScale' | 'zoomOut'
    >
}

/** One-shot Zoom Out control bound only to New viewport scale. */
export function DiagramZoomOutButton({ session = diagramEditSessionService }: DiagramZoomOutButtonProps) {
    const scale = useSyncExternalStore(
        session.subscribeViewportScale,
        session.getViewportScaleSnapshot,
        session.getViewportScaleSnapshot,
    )
    const handleZoomOut = useCallback(() => { session.zoomOut() }, [session])

    return (
        <DiagramToolboxActionButton
            disabled={scale <= MINIMUM_DIAGRAM_ZOOM}
            label="Zoom out"
            onActivate={handleZoomOut}
            tooltip="Zoom out"
        />
    )
}
