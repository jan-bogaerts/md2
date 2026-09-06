import { useCallback, useSyncExternalStore } from 'react'
import {
    canCutDiagramSelection,
    cutDiagramSelection,
    type DiagramCutSession,
} from '../../services/diagrams/diagram_cut'
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramCutButtonProps {
    cutSelection?: typeof cutDiagramSelection
    selection?: Pick<DiagramSelectionService, 'getSelectionSnapshot' | 'subscribeSelection'>
    session?: DiagramCutSession
}

/** Copies supported diagram selection before deleting those captured identities. */
export function DiagramCutButton({
    cutSelection = cutDiagramSelection,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramCutButtonProps) {
    const selectedObjects = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    )
    const handleCut = useCallback(() => {
        void cutSelection(selectedObjects, session)
    }, [cutSelection, selectedObjects, session])

    return (
        <DiagramToolboxActionButton
            disabled={!canCutDiagramSelection(selectedObjects, session)}
            label="Cut"
            onActivate={handleCut}
            tooltip="Cut selected diagram objects"
        />
    )
}
