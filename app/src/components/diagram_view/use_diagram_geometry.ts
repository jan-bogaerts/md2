import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramGeometryService,
    type DiagramGeometryService,
    type DiagramSurfaceSize,
    type PositionedBoxField,
    type PositionedFragmentField,
    type PositionedNodeField,
} from '../../services/diagrams/diagram_geometry_service'

function useGeometrySnapshot<Value>(
    subscribeScoped: (listener: () => void) => () => void,
    getSnapshot: () => Value,
    service: DiagramGeometryService,
) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeScoped = subscribeScoped(listener)
        const unsubscribeSession = service.subscribeGeometrySession(listener)

        return () => {
            unsubscribeScoped()
            unsubscribeSession()
        }
    }, [service, subscribeScoped])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Subscribes one leaf to one derived geometry field of one node. */
export function useDiagramNodeGeometryField(
    nodeId: string,
    field: PositionedNodeField,
    service: DiagramGeometryService = diagramGeometryService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeNodeGeometryField(nodeId, field, listener),
        [field, nodeId, service],
    )
    const getSnapshot = useCallback(() => service.getNodeGeometryFieldSnapshot(nodeId, field), [field, nodeId, service])

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one edge leaf to its own route; the array reference changes only when the route changes. */
export function useDiagramEdgeRoute(edgeId: string, service: DiagramGeometryService = diagramGeometryService) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeEdgeGeometryField(edgeId, 'points', listener),
        [edgeId, service],
    )
    const getSnapshot = useCallback(() => service.getEdgeRouteSnapshot(edgeId), [edgeId, service])

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one edge label leaf to its own placement box. */
export function useDiagramEdgeLabelPlacement(edgeId: string, service: DiagramGeometryService = diagramGeometryService) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeEdgeGeometryField(edgeId, 'labelPlacement', listener),
        [edgeId, service],
    )
    const getSnapshot = useCallback(() => service.getEdgeLabelPlacementSnapshot(edgeId), [edgeId, service])

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one derived geometry field of one group. */
export function useDiagramGroupGeometryField(
    groupId: string,
    field: PositionedBoxField,
    service: DiagramGeometryService = diagramGeometryService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeGroupGeometryField(groupId, field, listener),
        [field, groupId, service],
    )
    const getSnapshot = useCallback(() => service.getGroupGeometryFieldSnapshot(groupId, field), [field, groupId, service])

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one derived geometry field of one sequence activation bar. */
export function useDiagramActivationField(
    activationId: string,
    field: PositionedBoxField,
    service: DiagramGeometryService = diagramGeometryService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeActivationField(activationId, field, listener),
        [activationId, field, service],
    )
    const getSnapshot = useCallback(
        () => service.getActivationFieldSnapshot(activationId, field),
        [activationId, field, service],
    )

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes one leaf to one derived geometry field of one sequence fragment box. */
export function useDiagramFragmentGeometryField(
    fragmentId: string,
    field: PositionedFragmentField,
    service: DiagramGeometryService = diagramGeometryService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeFragmentGeometryField(fragmentId, field, listener),
        [field, fragmentId, service],
    )
    const getSnapshot = useCallback(
        () => (field === 'guardPositions'
            ? service.getFragmentGuardPositionsSnapshot(fragmentId)
            : service.getFragmentGeometryFieldSnapshot(fragmentId, field as PositionedBoxField)),
        [field, fragmentId, service],
    )

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}

/** Subscribes the activation collection host to activation membership only. */
export function useDiagramActivationIds(service: DiagramGeometryService = diagramGeometryService) {
    return useGeometrySnapshot(service.subscribeActivationIds, service.getActivationIdsSnapshot, service)
}

/** Subscribes the fragment collection host to fragment membership only. */
export function useDiagramFragmentIds(service: DiagramGeometryService = diagramGeometryService) {
    return useGeometrySnapshot(service.subscribeFragmentIds, service.getFragmentIdsSnapshot, service)
}

/** Subscribes the surface leaf to one surface bound, which changes only when that bound actually changes. */
export function useDiagramSurfaceField(
    field: keyof DiagramSurfaceSize,
    service: DiagramGeometryService = diagramGeometryService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeSurfaceField(field, listener),
        [field, service],
    )
    const getSnapshot = useCallback(() => service.getSurfaceFieldSnapshot(field), [field, service])

    return useGeometrySnapshot(subscribe, getSnapshot, service)
}
