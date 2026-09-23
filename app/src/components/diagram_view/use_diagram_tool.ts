import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService,
    type DiagramPersistentTool,
    type DiagramTransientGesture,
} from '../../services/diagrams/diagram_edit_session_service'

export interface DiagramActiveToolStore {
    getActiveToolSnapshot: () => DiagramPersistentTool
    subscribeActiveTool: (listener: () => void) => () => void
}

export interface DiagramTransientGestureStore {
    getTransientGestureSnapshot: () => DiagramTransientGesture | null
    subscribeTransientGesture: (listener: () => void) => () => void
}

/** Subscribes either an active-tool reader or one tool button to its selected boolean. */
export function useActiveDiagramTool(service?: DiagramActiveToolStore): DiagramPersistentTool
export function useActiveDiagramTool(service: DiagramActiveToolStore | undefined, tool: DiagramPersistentTool): boolean
export function useActiveDiagramTool(
    service: DiagramActiveToolStore = diagramEditSessionService,
    tool?: DiagramPersistentTool,
) {
    const getSnapshot = useCallback(
        () => tool ? service.getActiveToolSnapshot() === tool : service.getActiveToolSnapshot(),
        [service, tool],
    )

    return useSyncExternalStore(
        service.subscribeActiveTool,
        getSnapshot,
        getSnapshot,
    )
}

/** Subscribes one leaf to temporary placement, edge, or move gesture state. */
export function useDiagramTransientGesture(service: DiagramTransientGestureStore = diagramEditSessionService) {
    return useSyncExternalStore(
        service.subscribeTransientGesture,
        service.getTransientGestureSnapshot,
        service.getTransientGestureSnapshot,
    )
}
