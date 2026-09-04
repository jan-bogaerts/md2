import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramDeleteButtonProps {
    selection?: Pick<
        DiagramSelectionService,
        'deleteSelection' | 'getSelectionSnapshot' | 'subscribeSelection'
    >
}

/** Deletes complete diagram selection as one action. */
export function DiagramDeleteButton({ selection = diagramSelectionService }: DiagramDeleteButtonProps) {
    const selectedObjects = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    )
    const handleDelete = useCallback(() => { selection.deleteSelection() }, [selection])

    return (
        <DiagramToolboxActionButton
            disabled={selectedObjects.length === 0}
            label="Delete"
            onActivate={handleDelete}
            tooltip="Delete selected diagram objects"
        />
    )
}
