export const DIAGRAM_DATA_VERSION: 1
export const DIAGRAM_TYPES: readonly ['architecture', 'dependency', 'sequence', 'flow', 'entity']
export const DIAGRAM_ROLES: readonly ['focal', 'backend', 'store', 'external', 'input', 'optional', 'boundary']
export const DIAGRAM_NODE_KINDS: readonly ['component', 'participant', 'step', 'decision', 'start', 'end', 'state', 'entity']
export const DIAGRAM_EDGE_KINDS: readonly ['connection', 'data', 'dependency', 'cycle', 'call', 'return', 'async', 'success', 'flow', 'transition', 'relationship']
export const DIAGRAM_FLOW_PRESETS: readonly ['flowchart', 'state']
export const DIAGRAM_CARDINALITIES: readonly ['1', 'N', '0..1', '1..*']
export const DIAGRAM_SEQUENCE_OPERATORS: readonly ['alt', 'opt', 'loop']
export const DIAGRAM_CONNECTION_SIDES: readonly ['top', 'right', 'bottom', 'left']

export type DiagramType = typeof DIAGRAM_TYPES[number]
export type DiagramRole = typeof DIAGRAM_ROLES[number]
export type DiagramNodeKind = typeof DIAGRAM_NODE_KINDS[number]
export type DiagramEdgeKind = typeof DIAGRAM_EDGE_KINDS[number]
export type DiagramFlowPreset = typeof DIAGRAM_FLOW_PRESETS[number]
export type DiagramCardinality = typeof DIAGRAM_CARDINALITIES[number]
export type DiagramSequenceOperator = typeof DIAGRAM_SEQUENCE_OPERATORS[number]
export type DiagramConnectionSide = typeof DIAGRAM_CONNECTION_SIDES[number]

export interface DiagramMeta {
    description: string
    preset?: DiagramFlowPreset
    title: string
    type: DiagramType
    version: typeof DIAGRAM_DATA_VERSION
}
export interface DiagramEntityField { key?: 'primary' | 'foreign'; name: string; type?: string }
export interface DiagramNode {
    drilldown?: boolean
    fields?: DiagramEntityField[]
    height?: number
    id: string
    kind?: DiagramNodeKind
    label: string
    role: DiagramRole
    sublabel?: string
    tag?: string
    width?: number
    x?: number
    y?: number
}
export interface DiagramWaypoint { x: number; y: number }
export interface DiagramConnectionPoint { nodeId: string; offset: number; side: DiagramConnectionSide }
export interface DiagramEdge {
    from: string
    fromCardinality?: DiagramCardinality
    id: string
    kind: DiagramEdgeKind
    label?: string
    sourceAttachment?: DiagramConnectionPoint
    targetAttachment?: DiagramConnectionPoint
    to: string
    toCardinality?: DiagramCardinality
    waypoints?: DiagramWaypoint[]
}
export interface DiagramGroup { id: string; label: string; nodeIds: string[] }
export interface DiagramSequenceFragmentRegion { edgeIds: string[]; guard: string }
export interface DiagramSequenceFragment {
    id: string
    operator: DiagramSequenceOperator
    regions: DiagramSequenceFragmentRegion[]
}
export interface DiagramData {
    edges: DiagramEdge[]
    fragments?: DiagramSequenceFragment[]
    groups: DiagramGroup[]
    meta: DiagramMeta
    nodes: DiagramNode[]
}

export function parseDiagramData(content: string): DiagramData
export function serializeDiagramData(data: DiagramData): string
export function isDiagramDataPath(path: string): boolean
