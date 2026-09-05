import { useCallback, useSyncExternalStore } from 'react'
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramFragmentDialogService, type DiagramFragmentDialogService,
} from './diagram_fragment_dialog_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

export interface DiagramFragmentButtonSession {
    getMetadataFieldSnapshot: (field: 'type') => string | null
    subscribeMetadataField: (field: 'type', listener: () => void) => () => void
    subscribeSession: (listener: () => void) => () => void
}

/** Sequence-only action opening fragment creation dialog. */
export function DiagramFragmentButton({
    dialog = diagramFragmentDialogService,
    session = diagramEditSessionService,
}: {
    dialog?: Pick<DiagramFragmentDialogService, 'openCreate'>
    session?: DiagramFragmentButtonSession
}) {
    const subscribeDiagramType = useCallback((listener: () => void) => {
        const unsubscribeMetadata = session.subscribeMetadataField('type', listener)
        const unsubscribeSession = session.subscribeSession(listener)

        return () => {
            unsubscribeMetadata()
            unsubscribeSession()
        }
    }, [session])
    const getDiagramType = useCallback(() => session.getMetadataFieldSnapshot('type'), [session])
    const diagramType = useSyncExternalStore(subscribeDiagramType, getDiagramType, getDiagramType)
    const handleActivate = useCallback(() => dialog.openCreate(), [dialog])

    if (diagramType !== 'sequence') return null

    return <DiagramToolboxActionButton label="Fragment" onActivate={handleActivate} tooltip="Create sequence fragment" />
}
