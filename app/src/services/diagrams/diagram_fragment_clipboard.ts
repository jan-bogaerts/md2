import type {
    DiagramData,
    DiagramFlowPreset,
    DiagramType,
} from './diagram_data'
import { parseDiagramData } from './diagram_data'
import type {
    DiagramEditSessionService,
    ReadonlyDiagramData,
} from './diagram_edit_session_service'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

export const DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT = 'md2-diagram-fragment'
export const DIAGRAM_FRAGMENT_CLIPBOARD_VERSION = 1

type ReadonlyDiagramNode = ReadonlyDiagramData['nodes'][number]
type ReadonlyDiagramEdge = ReadonlyDiagramData['edges'][number]
type ReadonlyDiagramGroup = ReadonlyDiagramData['groups'][number]
type ReadonlyDiagramFragment = NonNullable<ReadonlyDiagramData['fragments']>[number]

export type DiagramFragmentReader = Pick<
    DiagramEditSessionService,
    | 'getEdgeIdsSnapshot'
    | 'getEdgeSnapshot'
    | 'getFragmentIdsSnapshot'
    | 'getFragmentSnapshot'
    | 'getGroupSnapshot'
    | 'getNodeIdsSnapshot'
    | 'getNodeSnapshot'
>

export interface DiagramFragmentClipboardPayload {
    edges: readonly ReadonlyDiagramEdge[]
    format: typeof DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT
    fragments: readonly ReadonlyDiagramFragment[]
    groups: readonly ReadonlyDiagramGroup[]
    nodes: readonly ReadonlyDiagramNode[]
    version: typeof DIAGRAM_FRAGMENT_CLIPBOARD_VERSION
}

interface DiagramValidationCandidate {
    preset?: DiagramFlowPreset
    type: DiagramType
}

const VALIDATION_CANDIDATES: readonly DiagramValidationCandidate[] = [
    { type: 'architecture' },
    { type: 'dependency' },
    { type: 'sequence' },
    { preset: 'flowchart', type: 'flow' },
    { preset: 'state', type: 'flow' },
    { type: 'entity' },
]

function requireClipboardRoot(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed diagram clipboard data: root has invalid value')
    }

    return value as Record<string, unknown>
}

function parseClipboardObjects(root: Record<string, unknown>) {
    if (!Array.isArray(root.edges)) throw new Error('Malformed diagram clipboard data: edges has invalid array')
    if (!Array.isArray(root.fragments)) throw new Error('Malformed diagram clipboard data: fragments has invalid array')
    if (!Array.isArray(root.groups)) throw new Error('Malformed diagram clipboard data: groups has invalid array')
    if (!Array.isArray(root.nodes)) throw new Error('Malformed diagram clipboard data: nodes has invalid array')

    for (const { preset, type } of VALIDATION_CANDIDATES) {
        const meta = {
            description: 'Clipboard fragment',
            ...(preset ? { preset } : {}),
            title: 'Clipboard fragment',
            type,
            version: 1 as const,
        }
        try {
            return parseDiagramData(JSON.stringify({
                edges: root.edges,
                fragments: root.fragments,
                groups: root.groups,
                meta,
                nodes: root.nodes,
            }))
        } catch {
            // Try every supported diagram type because clipboard data intentionally omits source metadata.
        }
    }

    throw new Error('Malformed diagram clipboard data: objects have invalid fields or relationships')
}

function selectedIdsByKind(identities: readonly DiagramSelectionIdentity[]) {
    const edgeIds = new Set<string>()
    const groupIds = new Set<string>()
    const nodeIds = new Set<string>()
    for (const { objectId, objectKind } of identities) {
        if (objectKind === 'edge') edgeIds.add(objectId)
        if (objectKind === 'group') groupIds.add(objectId)
        if (objectKind === 'node') nodeIds.add(objectId)
    }

    return { edgeIds, groupIds, nodeIds }
}

function selectedNodes(nodeIds: ReadonlySet<string>, reader: DiagramFragmentReader) {
    const nodes: ReadonlyDiagramNode[] = []
    for (const nodeId of nodeIds) {
        const node = reader.getNodeSnapshot(nodeId)
        if (!node) return null

        nodes.push(node)
    }

    return nodes
}

function includedEdges(nodeIds: ReadonlySet<string>, reader: DiagramFragmentReader) {
    const edges: ReadonlyDiagramEdge[] = []
    for (const edgeId of reader.getEdgeIdsSnapshot()) {
        const edge = reader.getEdgeSnapshot(edgeId)
        if (!edge) continue
        if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) edges.push(edge)
    }

    return edges
}

function selectedEdgesAreSupported(
    selectedEdgeIds: ReadonlySet<string>,
    includedEdgeIds: ReadonlySet<string>,
) {
    return [...selectedEdgeIds].every((edgeId) => includedEdgeIds.has(edgeId))
}

function selectedGroups(
    groupIds: ReadonlySet<string>,
    nodeIds: ReadonlySet<string>,
    reader: DiagramFragmentReader,
) {
    const groups: ReadonlyDiagramGroup[] = []
    for (const groupId of groupIds) {
        const group = reader.getGroupSnapshot(groupId)
        if (!group || !group.nodeIds.every((nodeId) => nodeIds.has(nodeId))) return null

        groups.push(group)
    }

    return groups
}

function relevantFragments(includedEdgeIds: ReadonlySet<string>, reader: DiagramFragmentReader) {
    const fragments: ReadonlyDiagramFragment[] = []
    for (const fragmentId of reader.getFragmentIdsSnapshot()) {
        const fragment = reader.getFragmentSnapshot(fragmentId)
        if (!fragment) continue
        const regions = fragment.regions.map((region) => ({
            edgeIds: region.edgeIds.filter((edgeId) => includedEdgeIds.has(edgeId)),
            guard: region.guard,
        }))
        if (regions.some(({ edgeIds }) => edgeIds.length === 0)) continue

        fragments.push({ id: fragment.id, operator: fragment.operator, regions })
    }

    return fragments
}

/** Builds self-contained clipboard data from selected identities and their required relationships. */
export function buildDiagramFragmentClipboardPayload(
    identities: readonly DiagramSelectionIdentity[],
    reader: DiagramFragmentReader,
): DiagramFragmentClipboardPayload | null {
    const { edgeIds: selectedEdgeIds, groupIds, nodeIds } = selectedIdsByKind(identities)
    if (nodeIds.size === 0) return null
    if (nodeIds.size === reader.getNodeIdsSnapshot().length) return null

    const nodes = selectedNodes(nodeIds, reader)
    if (!nodes) return null
    const edges = includedEdges(nodeIds, reader)
    const includedEdgeIds = new Set(edges.map(({ id }) => id))
    if (!selectedEdgesAreSupported(selectedEdgeIds, includedEdgeIds)) return null
    const groups = selectedGroups(groupIds, nodeIds, reader)
    if (!groups) return null

    return {
        edges,
        format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
        fragments: relevantFragments(includedEdgeIds, reader),
        groups,
        nodes,
        version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
    }
}

/** Serializes one versioned internal diagram fragment without mutating source objects. */
export function serializeDiagramFragmentClipboardPayload(payload: DiagramFragmentClipboardPayload) {
    return JSON.stringify(payload)
}

/** Parses and validates clipboard envelope, object fields, and internal relationships before paste. */
export function parseDiagramFragmentClipboardPayload(content: string): DiagramFragmentClipboardPayload {
    let parsedValue: unknown
    try {
        parsedValue = JSON.parse(content)
    } catch {
        throw new Error('Malformed diagram clipboard data: invalid JSON')
    }
    const root = requireClipboardRoot(parsedValue)
    if (root.format !== DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT) {
        throw new Error(`Malformed diagram clipboard data: format has unsupported value ${String(root.format)}`)
    }
    if (root.version !== DIAGRAM_FRAGMENT_CLIPBOARD_VERSION) {
        throw new Error(`Malformed diagram clipboard data: version has unsupported value ${String(root.version)}`)
    }
    const diagram = parseClipboardObjects(root) as DiagramData

    return {
        edges: diagram.edges,
        format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
        fragments: diagram.fragments ?? [],
        groups: diagram.groups,
        nodes: diagram.nodes,
        version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
    }
}
