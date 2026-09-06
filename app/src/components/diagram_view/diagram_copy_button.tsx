import { useCallback, useSyncExternalStore } from 'react'
import {
    copyDiagramSelection,
    type DiagramCopySession,
} from '../../services/diagrams/diagram_copy'
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramCopyButtonProps {
    copySelection?: typeof copyDiagramSelection
    selection?: Pick<DiagramSelectionService, 'getSelectionSnapshot' | 'subscribeSelection'>
    session?: DiagramCopySession
}

/** Copies selected diagram objects without changing selection or diagram state. */
export function DiagramCopyButton({
    copySelection = copyDiagramSelection,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramCopyButtonProps) {
    const selectedObjects = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    )
    const handleCopy = useCallback(() => {
        void copySelection(selectedObjects, session)
    }, [copySelection, selectedObjects, session])

    return (
        <DiagramToolboxActionButton
            disabled={selectedObjects.length === 0}
            label="Copy"
            onActivate={handleCopy}
            tooltip="Copy selected diagram objects"
        />
    )
}
