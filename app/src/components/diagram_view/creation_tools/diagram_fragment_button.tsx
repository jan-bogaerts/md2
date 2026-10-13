import type { DiagramEditSessionReadAdapter } from '../../../services/diagrams/diagram_edit_session_read_adapter'
import type { DiagramType } from '../../../services/diagrams/diagram_data'
import { useCallback, useSyncExternalStore } from 'react'
import DashboardCustomizeOutlined from '@mui/icons-material/DashboardCustomizeOutlined'
import { diagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import {
    diagramFragmentDialogService, type DiagramFragmentDialogService,
} from '../details/diagram_fragment_dialog_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

export interface DiagramFragmentButtonSession {
    read: Pick<DiagramEditSessionReadAdapter, 'subscribeSession'> & { getMetadataFieldSnapshot: (field: 'type') => DiagramType | null; subscribeMetadataField: (field: 'type', listener: () => void) => () => void };
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
        const unsubscribeMetadata = session.read.subscribeMetadataField('type', listener)
        const unsubscribeSession = session.read.subscribeSession(listener)

        return () => {
            unsubscribeMetadata()
            unsubscribeSession()
        }
    }, [session])
    const getDiagramType = useCallback(() => session.read.getMetadataFieldSnapshot('type'), [session])
    const diagramType = useSyncExternalStore(subscribeDiagramType, getDiagramType, getDiagramType)
    const handleActivate = useCallback(() => dialog.openCreate(), [dialog])

    if (diagramType !== 'sequence') return null

    return (
        <DiagramToolboxActionButton label="Fragment" onActivate={handleActivate} tooltip="Create sequence fragment">
            <DashboardCustomizeOutlined fontSize="small" />
        </DiagramToolboxActionButton>
    )
}
