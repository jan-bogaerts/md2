import { useCallback, useSyncExternalStore } from 'react'
import type {
    DiagramConnectionPoint,
    DiagramEdge,
    DiagramEntityField,
    DiagramGroup,
    DiagramMeta,
    DiagramNode,
    DiagramSequenceFragment,
} from '../../services/diagrams/diagram_data'
import {
    diagramEditSessionService,
    type DiagramChangeField,
    type DiagramConnectionEndpoint,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'

function useDiagramSnapshot<Value>(
    subscribeScoped: (listener: () => void) => () => void,
    getSnapshot: () => Value,
    service: DiagramEditSessionService,
) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeScoped = subscribeScoped(listener)
        const unsubscribeSession = service.subscribeSession(listener)

        return () => {
            unsubscribeScoped()
            unsubscribeSession()
        }
    }, [service, subscribeScoped])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Subscribes one leaf to one editable metadata field. */
export function useEditableDiagramMetadataField<Field extends keyof DiagramMeta>(
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeMetadataField(field, listener),
        [field, service],
    )
    const getSnapshot = useCallback(() => service.getMetadataFieldSnapshot(field), [field, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one field of one editable node. */
export function useEditableDiagramNodeField<Field extends keyof DiagramNode>(
    nodeId: string,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeNodeField(nodeId, field, listener),
        [field, nodeId, service],
    )
    const getSnapshot = useCallback(() => service.getNodeFieldSnapshot(nodeId, field), [field, nodeId, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one field of one editable edge. */
export function useEditableDiagramEdgeField<Field extends keyof DiagramEdge>(
    edgeId: string,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeEdgeField(edgeId, field, listener),
        [edgeId, field, service],
    )
    const getSnapshot = useCallback(() => service.getEdgeFieldSnapshot(edgeId, field), [edgeId, field, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one field of one editable group. */
export function useEditableDiagramGroupField<Field extends keyof DiagramGroup>(
    groupId: string,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeGroupField(groupId, field, listener),
        [field, groupId, service],
    )
    const getSnapshot = useCallback(() => service.getGroupFieldSnapshot(groupId, field), [field, groupId, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one field of one editable sequence fragment. */
export function useEditableDiagramFragmentField<Field extends keyof DiagramSequenceFragment>(
    fragmentId: string,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeFragmentField(fragmentId, field, listener),
        [field, fragmentId, service],
    )
    const getSnapshot = useCallback(
        () => service.getFragmentFieldSnapshot(fragmentId, field),
        [field, fragmentId, service],
    )

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one position-addressed entity field value. */
export function useEditableDiagramEntityField<Field extends keyof DiagramEntityField>(
    nodeId: string,
    fieldIndex: number,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeEntityField(nodeId, fieldIndex, field, listener),
        [field, fieldIndex, nodeId, service],
    )
    const getSnapshot = useCallback(
        () => service.getEntityFieldValueSnapshot(nodeId, fieldIndex, field),
        [field, fieldIndex, nodeId, service],
    )

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one entity field host to field-list membership and order. */
export function useEditableDiagramEntityFieldIndexes(
    nodeId: string,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeEntityFieldMembership(nodeId, listener),
        [nodeId, service],
    )
    const getSnapshot = useCallback(() => service.getEntityFieldIndexesSnapshot(nodeId), [nodeId, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one membership leaf to the node IDs of one editable group. */
export function useEditableDiagramGroupNodeIds(
    groupId: string,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeGroupMembership(groupId, listener),
        [groupId, service],
    )
    const getSnapshot = useCallback(() => service.getGroupNodeIdsSnapshot(groupId), [groupId, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one edge connection-point field. */
export function useEditableDiagramConnectionPointField<Field extends keyof DiagramConnectionPoint>(
    edgeId: string,
    endpoint: DiagramConnectionEndpoint,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeConnectionPointField(edgeId, endpoint, field, listener),
        [edgeId, endpoint, field, service],
    )
    const getSnapshot = useCallback(
        () => service.getConnectionPointFieldSnapshot(edgeId, endpoint, field),
        [edgeId, endpoint, field, service],
    )

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

function useEditableDiagramCollectionIds(
    objectKind: 'edge' | 'fragment' | 'group' | 'node',
    getSnapshot: () => readonly string[],
    service: DiagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeCollectionMembership(objectKind, listener),
        [objectKind, service],
    )

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

export function useEditableDiagramNodeIds(service: DiagramEditSessionService = diagramEditSessionService) {
    return useEditableDiagramCollectionIds('node', service.getNodeIdsSnapshot, service)
}

export function useEditableDiagramEdgeIds(service: DiagramEditSessionService = diagramEditSessionService) {
    return useEditableDiagramCollectionIds('edge', service.getEdgeIdsSnapshot, service)
}

export function useEditableDiagramGroupIds(service: DiagramEditSessionService = diagramEditSessionService) {
    return useEditableDiagramCollectionIds('group', service.getGroupIdsSnapshot, service)
}

export function useEditableDiagramFragmentIds(service: DiagramEditSessionService = diagramEditSessionService) {
    return useEditableDiagramCollectionIds('fragment', service.getFragmentIdsSnapshot, service)
}

/** Subscribes one legend host to explicit legend membership and order. */
export function useEditableDiagramLegendEntryKeys(service: DiagramEditSessionService = diagramEditSessionService) {
    return useDiagramSnapshot(service.subscribeLegendMembership, service.getLegendEntryKeysSnapshot, service)
}

/** Subscribes one legend leaf to the label of one explicit legend entry. */
export function useEditableDiagramLegendEntryLabel(
    entryKey: string,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeLegendEntryField(entryKey, 'label', listener),
        [entryKey, service],
    )
    const getSnapshot = useCallback(() => service.getLegendEntryFieldSnapshot(entryKey, 'label'), [entryKey, service])

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}

/** Subscribes a review collection only to semantic change membership and order. */
export function useEditableDiagramChangeIds(service: DiagramEditSessionService = diagramEditSessionService) {
    return useDiagramSnapshot(service.subscribeChangeIds, service.getChangeIdsSnapshot, service)
}

/** Subscribes one review leaf to one field of one semantic change. */
export function useEditableDiagramChangeField<Field extends DiagramChangeField>(
    changeId: string,
    field: Field,
    service: DiagramEditSessionService = diagramEditSessionService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeChangeField(changeId, field, listener),
        [changeId, field, service],
    )
    const getSnapshot = useCallback(
        () => service.getChangeFieldSnapshot(changeId, field),
        [changeId, field, service],
    )

    return useDiagramSnapshot(subscribe, getSnapshot, service)
}
