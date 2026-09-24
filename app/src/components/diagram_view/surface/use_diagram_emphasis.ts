import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEmphasisService,
    type DiagramEmphasisObjectKind,
    type DiagramEmphasisService,
    type DiagramSurface,
} from '../../../services/diagrams/diagram_emphasis_service'

type EmphasisObjectStore = Pick<DiagramEmphasisService, 'getDimmedSnapshot' | 'subscribeDimmed'>
type EmphasisDecorationStore = Pick<DiagramEmphasisService, 'getDecorationsDimmedSnapshot' | 'subscribeDecorationsDimmed'>

export function useDiagramObjectDimmed(
    surface: DiagramSurface,
    objectKind: DiagramEmphasisObjectKind,
    objectId: string,
    service: EmphasisObjectStore = diagramEmphasisService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeDimmed(surface, objectKind, objectId, listener),
        [objectId, objectKind, service, surface],
    )
    const getSnapshot = useCallback(
        () => service.getDimmedSnapshot(surface, objectKind, objectId),
        [objectId, objectKind, service, surface],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDiagramDecorationsDimmed(
    surface: DiagramSurface,
    service: EmphasisDecorationStore = diagramEmphasisService,
) {
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeDecorationsDimmed(surface, listener),
        [service, surface],
    )
    const getSnapshot = useCallback(
        () => service.getDecorationsDimmedSnapshot(surface),
        [service, surface],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
