import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramEditSessionReadAdapter } from '../../../services/diagrams/diagram_edit_session_read_adapter'
import type {
    DiagramPersistentTool,
} from '../../../services/diagrams/diagram_edit_types'
export interface DiagramActiveToolStore {
    read: Pick<DiagramEditSessionReadAdapter, 'getActiveToolSnapshot' | 'subscribeActiveTool'>
}

export interface DiagramTransientGestureStore {
    read: Pick<DiagramEditSessionReadAdapter, 'getTransientGestureSnapshot' | 'subscribeTransientGesture'>
}

/** Subscribes either an active-tool reader or one tool button to its selected boolean. */
export function useActiveDiagramTool(service?: DiagramActiveToolStore): DiagramPersistentTool
export function useActiveDiagramTool(service: DiagramActiveToolStore | undefined, tool: DiagramPersistentTool): boolean
export function useActiveDiagramTool(
    service: DiagramActiveToolStore = diagramEditSessionService,
    tool?: DiagramPersistentTool,
) {
    const getSnapshot = useCallback(
        () => tool ? service.read.getActiveToolSnapshot() === tool : service.read.getActiveToolSnapshot(),
        [service, tool],
    )

    return useSyncExternalStore(
        service.read.subscribeActiveTool,
        getSnapshot,
        getSnapshot,
    )
}

/** Subscribes one leaf to temporary placement, edge, or move gesture state. */
export function useDiagramTransientGesture(service: DiagramTransientGestureStore = diagramEditSessionService) {
    return useSyncExternalStore(
        service.read.subscribeTransientGesture,
        service.read.getTransientGestureSnapshot,
        service.read.getTransientGestureSnapshot,
    )
}
