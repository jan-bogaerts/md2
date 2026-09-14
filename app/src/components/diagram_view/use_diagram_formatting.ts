import { useCallback, useSyncExternalStore } from 'react'
import type {
    DiagramConnectionKindFormatting,
    DiagramEdgeKind,
    DiagramNodeRoleFormatting,
    DiagramRole,
} from '../../services/diagrams/diagram_data'
import type { DiagramScaleField } from '../../services/diagrams/diagram_formatting'

export interface DiagramFormattingStore {
    getConnectionKindFormattingSnapshot(kind: DiagramEdgeKind): DiagramConnectionKindFormatting | undefined
    getFormattingScaleSnapshot(field: DiagramScaleField): number
    getNodeRoleFormattingSnapshot(role: DiagramRole): DiagramNodeRoleFormatting | undefined
    subscribeConnectionKindFormatting(kind: DiagramEdgeKind, listener: () => void): () => void
    subscribeFormattingScale(field: DiagramScaleField, listener: () => void): () => void
    subscribeNodeRoleFormatting(role: DiagramRole, listener: () => void): () => void
}

const DEFAULT_DIAGRAM_FORMATTING_STORE: DiagramFormattingStore = {
    getConnectionKindFormattingSnapshot: () => undefined,
    getFormattingScaleSnapshot: () => 100,
    getNodeRoleFormattingSnapshot: () => undefined,
    subscribeConnectionKindFormatting: () => () => undefined,
    subscribeFormattingScale: () => () => undefined,
    subscribeNodeRoleFormatting: () => () => undefined,
}

export function useDiagramFormattingScale(field: DiagramScaleField, store?: DiagramFormattingStore) {
    const source = store ?? DEFAULT_DIAGRAM_FORMATTING_STORE
    const subscribe = useCallback((listener: () => void) => source.subscribeFormattingScale(field, listener), [field, source])
    const getSnapshot = useCallback(() => source.getFormattingScaleSnapshot(field), [field, source])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDiagramNodeRoleFormatting(role: DiagramRole, store?: DiagramFormattingStore) {
    const source = store ?? DEFAULT_DIAGRAM_FORMATTING_STORE
    const subscribe = useCallback((listener: () => void) => source.subscribeNodeRoleFormatting(role, listener), [role, source])
    const getSnapshot = useCallback(() => source.getNodeRoleFormattingSnapshot(role), [role, source])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDiagramConnectionKindFormatting(kind: DiagramEdgeKind, store?: DiagramFormattingStore) {
    const source = store ?? DEFAULT_DIAGRAM_FORMATTING_STORE
    const subscribe = useCallback(
        (listener: () => void) => source.subscribeConnectionKindFormatting(kind, listener),
        [kind, source],
    )
    const getSnapshot = useCallback(() => source.getConnectionKindFormattingSnapshot(kind), [kind, source])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
