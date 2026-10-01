import type { DiagramEdgeKind, DiagramNodeKind, DiagramType } from './diagram_data'

const NODE_LABELS: Record<DiagramNodeKind, string> = {
    component: 'Component', decision: 'Decision', end: 'End', entity: 'Entity',
    participant: 'Participant', root: 'Root', start: 'Start', state: 'State', step: 'Step', topic: 'Topic',
}

const EDGE_LABELS: Record<DiagramEdgeKind, string> = {
    async: 'Async', call: 'Call', connection: 'Connection', cycle: 'Cycle', data: 'Data',
    dependency: 'Dependency', flow: 'Flow', relationship: 'Relationship', return: 'Return',
    success: 'Success', transition: 'Transition',
}

export function diagramNodeKindLabel(kind: DiagramNodeKind) { return NODE_LABELS[kind] }
export function diagramEdgeKindLabel(kind: DiagramEdgeKind) { return EDGE_LABELS[kind] }

export function effectiveDiagramNodeKind(kind: DiagramNodeKind | undefined, type: DiagramType): DiagramNodeKind {
    if (kind) return kind
    if (type === 'architecture' || type === 'dependency') return 'component'
    if (type === 'entity') return 'entity'
    if (type === 'sequence') return 'participant'
    throw new Error(`Node kind required for ${type} diagram`)
}
