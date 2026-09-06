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
    const getCanZoomOutSnapshot = useCallback(
        () => session.getViewportScaleSnapshot() > MINIMUM_DIAGRAM_ZOOM,
        [session],
    )
    const canZoomOut = useSyncExternalStore(
        session.subscribeViewportScale,
        getCanZoomOutSnapshot,
        getCanZoomOutSnapshot,
    )
    const handleZoomOut = useCallback(() => { session.zoomOut() }, [session])

    return (
        <DiagramToolboxActionButton
            disabled={!canZoomOut}
            label="Zoom out"
            onActivate={handleZoomOut}
            tooltip="Zoom out"
        />
    )
}
