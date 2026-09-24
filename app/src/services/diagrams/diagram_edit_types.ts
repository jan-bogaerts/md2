import type { DiagramRecord } from './diagram_index';
import type {
    DiagramConnectionPoint,
    DiagramData,
    DiagramEdge,
    DiagramEdgeKind,
    DiagramEntityField,
    DiagramGroup,
    DiagramNode,
    DiagramNodeKind,
    DiagramRole,
    DiagramSequenceFragment,
} from './diagram_data';

export type DiagramCollectionKind = 'edge' | 'fragment' | 'group' | 'node'
export type DiagramObjectKind = DiagramCollectionKind | 'connectionPoint' | 'entityField' | 'formatting' | 'legendEntry' | 'meta'
export type DiagramRemovableObjectKind = Extract<DiagramCollectionKind, 'edge' | 'group' | 'node'>
export type DiagramConnectionEndpoint = 'sourceAttachment' | 'targetAttachment'
export type DiagramPersistentTool = 'select' | 'pan' | 'fragment' | 'group' | `node:${DiagramNodeKind}` | `edge:${DiagramEdgeKind}`
export type DiagramCreationTool = Exclude<DiagramPersistentTool, 'pan' | 'select'>
export type DiagramTransientGesture = 'placement' | 'edge' | 'group' | 'move' | 'pan' | 'resize'
export type MutableDiagramMetaField = 'description' | 'title'
export type MutableDiagramLegendEntryField = 'label'
export type MutableDiagramNodeField = Exclude<keyof DiagramNode, 'fields' | 'id'>
export type MutableDiagramEdgeField = Exclude<keyof DiagramEdge, 'id' | 'sourceAttachment' | 'targetAttachment' | 'waypoints'>
export type MutableDiagramGroupField = Exclude<keyof DiagramGroup, 'id' | 'nodeIds'>
export type MutableDiagramFragmentField = 'operator'
export type MutableDiagramFragmentRegionField = 'guard'
export type MutableDiagramEntityField = keyof DiagramEntityField
export type MutableDiagramConnectionPointField = keyof DiagramConnectionPoint

export type DeepReadonly<Value> = Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
        ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value

export type ReadonlyDiagramData = DeepReadonly<DiagramData>

export type NewDiagramNode = Omit<DiagramNode, 'id'>
export type NewDiagramEdge = Omit<DiagramEdge, 'id'>
export type NewDiagramGroup = Omit<DiagramGroup, 'id'>
export type NewDiagramSequenceFragment = Omit<DiagramSequenceFragment, 'id'>
export type NewDiagramLegendEntry = { label?: string, role: DiagramRole } | { kind: DiagramEdgeKind, label?: string }

export interface DiagramEditSessionSnapshot {
    sourceDiagramId: string
    creationSourceDiagramId?: string
}

export interface OriginalDiagramSnapshot {
    diagram: DiagramData
    record: DiagramRecord
}

/** Describes one collection-membership transaction: which member IDs entered or left which collection. */
export interface DiagramMembershipChangeDetail {
    addedIds: readonly string[]
    memberKind: DiagramCollectionKind
    ownerId: string | null
    regionIndex: number | null
    removedIds: readonly string[]
}

/** Describes one legend membership transaction: which entry keys entered or left the explicit legend. */
export interface DiagramLegendMembershipChangeDetail {
    addedKeys: readonly string[]
    removedKeys: readonly string[]
}

export interface DiagramEntityFieldMembershipChangeDetail {
    addedIndexes: readonly number[]
    nodeId: string
    removedIndexes: readonly number[]
}

export interface DiagramRemovalIdentity {
    objectId: string
    objectKind: DiagramRemovableObjectKind
}

export interface DiagramPasteFragment {
    edges: readonly (ReadonlyDiagramData['edges'][number])[]
    fragments: readonly (NonNullable<ReadonlyDiagramData['fragments']>[number])[]
    groups: readonly (ReadonlyDiagramData['groups'][number])[]
    nodes: readonly (ReadonlyDiagramData['nodes'][number])[]
}

export interface DiagramPasteResult {
    identities: readonly DiagramRemovalIdentity[]
}

export interface DiagramFieldChangeDetail {
    field: string
    objectId: string
    objectKind: DiagramObjectKind
    previousValue: unknown
    value: unknown
}

export type DiagramChangeCategory = 'collection' | 'field' | 'membership'

/** One net semantic difference between original and editable diagram state. */
export interface DiagramChange {
    category: DiagramChangeCategory
    field: string | null
    id: string
    objectId: string
    objectKind: DiagramObjectKind
    originalValue: unknown
    ownerId: string | null
    regionIndex: number | null
    value: unknown
}

export type DiagramChangeField = keyof DiagramChange
