import { useCallback, useEffect, useSyncExternalStore } from 'react'
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

export interface DiagramInteractionCancellation {
    cancelActiveInteraction: () => boolean
}

/** Subscribes one leaf to active persistent diagram tool. */
export function useActiveDiagramTool(service: DiagramActiveToolStore = diagramEditSessionService) {
    return useSyncExternalStore(
        service.subscribeActiveTool,
        service.getActiveToolSnapshot,
        service.getActiveToolSnapshot,
    )
}

/** Subscribes one leaf to temporary placement or edge gesture state. */
export function useDiagramTransientGesture(service: DiagramTransientGestureStore = diagramEditSessionService) {
    return useSyncExternalStore(
        service.subscribeTransientGesture,
        service.getTransientGestureSnapshot,
        service.getTransientGestureSnapshot,
    )
}

/** Cancels active diagram interaction from Escape while editor UI is mounted. */
export function useCancelDiagramInteractionOnEscape(
    service: DiagramInteractionCancellation = diagramEditSessionService,
) {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape') return
        if (service.cancelActiveInteraction()) event.preventDefault()
    }, [service])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)

        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])
}
