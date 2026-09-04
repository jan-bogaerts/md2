import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
    diagramSelectionService,
    type DiagramSelectableObjectKind,
    type DiagramSelectionIdentity,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'

/** Subscribes one selectable diagram leaf to its own selection membership boolean. */
export function useIsDiagramObjectSelected(
    objectId: string,
    objectKind: DiagramSelectableObjectKind,
    service: DiagramSelectionService = diagramSelectionService,
) {
    const identity = useMemo<DiagramSelectionIdentity>(() => ({ objectId, objectKind }), [objectId, objectKind])
    const getSnapshot = useCallback(() => service.getSelectedSnapshot(identity), [identity, service])
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeSelected(identity, listener),
        [identity, service],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
