import {
    requireDiagramEdgeKind,
    requireDiagramEdgeLabel,
    requireDiagramGridNumber,
    type DiagramData,
    type DiagramEdge,
    type DiagramGroup,
    type DiagramNode,
    type DiagramSequenceFragment,
} from './diagram_data';
import type { DiagramPasteFragment, ReadonlyDiagramData } from './diagram_edit_types';

export interface PreparedDiagramPaste {
    edges: DiagramEdge[];
    fragments: DiagramSequenceFragment[];
    groups: DiagramGroup[];
    nodes: DiagramNode[];
}

export interface DiagramPastePreparationContext {
    diagram: DiagramData;
    generateId: (reservedIds: Set<string>) => string;
    validateFragment: (fragment: DiagramSequenceFragment) => void;
    validateGroup: (group: DiagramGroup) => void;
    validateNode: (node: DiagramNode) => void;
}

function invalidPasteField(field: string, reason: string): never {
    throw new Error(`Malformed diagram data: ${field} has ${reason}`);
}

function mapRequiredId(ids: ReadonlyMap<string, string>, id: string, field: string, reason: string) {
    const mappedId = ids.get(id);
    if (!mappedId) invalidPasteField(field, reason);

    return mappedId;
}

function createPastedNode(
    source: ReadonlyDiagramData['nodes'][number],
    nodeIds: ReadonlyMap<string, string>,
    offset: number,
    validateNode: (node: DiagramNode) => void,
) {
    const id = mapRequiredId(nodeIds, source.id, 'paste.nodes', `missing ID mapping for node ${source.id}`);
    const node: DiagramNode = {
        ...source,
        fields: source.fields?.map((field) => ({ ...field })),
        id,
        ...(source.x === undefined ? {} : { x: source.x + offset }),
        ...(source.y === undefined ? {} : { y: source.y + offset }),
    };
    validateNode(node);

    return node;
}

function createPastedEdge(
    source: ReadonlyDiagramData['edges'][number],
    nodeIds: ReadonlyMap<string, string>,
    edgeIds: ReadonlyMap<string, string>,
    pastedNodesById: ReadonlyMap<string, DiagramNode>,
    diagram: DiagramData,
    offset: number,
) {
    const missingMapping = `missing internal ID mapping for edge ${source.id}`;
    const id = mapRequiredId(edgeIds, source.id, 'paste.edges', missingMapping);
    const from = mapRequiredId(nodeIds, source.from, 'paste.edges', missingMapping);
    const to = mapRequiredId(nodeIds, source.to, 'paste.edges', missingMapping);
    const edge: DiagramEdge = {
        ...source,
        from,
        id,
        to,
        ...(source.sourceAttachment ? { sourceAttachment: { ...source.sourceAttachment, nodeId: from } } : {}),
        ...(source.targetAttachment ? { targetAttachment: { ...source.targetAttachment, nodeId: to } } : {}),
        waypoints: source.waypoints?.map(({ x, y }) => ({ x: x + offset, y: y + offset })),
    };
    const sourceNode = pastedNodesById.get(edge.from);
    if (!sourceNode || !pastedNodesById.has(edge.to)) invalidPasteField(`paste.edges.${edge.id}`, 'unknown endpoint');
    requireDiagramEdgeKind(edge.kind, diagram.meta.type, `paste.edges.${edge.id}.kind`);
    requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, sourceNode.kind, `paste.edges.${edge.id}.label`);
    if ((edge.fromCardinality !== undefined || edge.toCardinality !== undefined) && diagram.meta.type !== 'entity') {
        invalidPasteField(`paste.edges.${edge.id}.cardinality`, 'value only allowed for entity diagrams');
    }

    return edge;
}

function createPastedGroup(
    source: ReadonlyDiagramData['groups'][number],
    nodeIds: ReadonlyMap<string, string>,
    groupIds: ReadonlyMap<string, string>,
    offset: number,
    validateGroup: (group: DiagramGroup) => void,
) {
    const id = mapRequiredId(groupIds, source.id, 'paste.groups', `missing ID mapping for group ${source.id}`);
    const mappedNodeIds = source.nodeIds.map((nodeId) => {
        const mappedId = nodeIds.get(nodeId);
        if (!mappedId) invalidPasteField(`paste.groups.${source.id}.nodeIds`, `unknown node ${nodeId}`);

        return mappedId;
    });
    const group: DiagramGroup = {
        ...source,
        id,
        nodeIds: mappedNodeIds,
        ...(source.x === undefined ? {} : { x: source.x + offset }),
        ...(source.y === undefined ? {} : { y: source.y + offset }),
    };
    validateGroup(group);

    return group;
}

function createPastedSequenceFragment(
    source: NonNullable<ReadonlyDiagramData['fragments']>[number],
    edgeIds: ReadonlyMap<string, string>,
    fragmentIds: ReadonlyMap<string, string>,
    validateFragment: (fragment: DiagramSequenceFragment) => void,
) {
    const id = mapRequiredId(fragmentIds, source.id, 'paste.fragments', `missing ID mapping for fragment ${source.id}`);
    const regions = source.regions.map((region) => ({
        edgeIds: region.edgeIds.map((edgeId) => {
            const mappedId = edgeIds.get(edgeId);
            if (!mappedId) invalidPasteField(`paste.fragments.${source.id}.regions.edgeIds`, `unknown edge ${edgeId}`);

            return mappedId;
        }),
        guard: region.guard,
    }));
    const fragment: DiagramSequenceFragment = { id, operator: source.operator, regions };
    validateFragment(fragment);

    return fragment;
}

/** Remaps a self-contained fragment without changing the active diagram. */
export function prepareDiagramPaste(
    fragment: DiagramPasteFragment,
    offset: number,
    context: DiagramPastePreparationContext,
): PreparedDiagramPaste {
    requireDiagramGridNumber(offset, 'paste.offset', true);
    const { diagram, generateId, validateFragment, validateGroup, validateNode } = context;
    const nodeIds = new Map<string, string>();
    const edgeIds = new Map<string, string>();
    const groupIds = new Map<string, string>();
    const fragmentIds = new Map<string, string>();
    const reservedSelectableIds = new Set([...diagram.nodes.map(({ id }) => id), ...diagram.edges.map(({ id }) => id)]);
    for (const node of fragment.nodes) nodeIds.set(node.id, generateId(reservedSelectableIds));
    for (const edge of fragment.edges) edgeIds.set(edge.id, generateId(reservedSelectableIds));
    const reservedGroupIds = new Set(diagram.groups.map(({ id }) => id));
    for (const group of fragment.groups) groupIds.set(group.id, generateId(reservedGroupIds));
    const reservedFragmentIds = new Set((diagram.fragments ?? []).map(({ id }) => id));
    for (const sourceFragment of fragment.fragments) fragmentIds.set(sourceFragment.id, generateId(reservedFragmentIds));

    const nodes = fragment.nodes.map((node) => createPastedNode(node, nodeIds, offset, validateNode));
    const pastedNodesById = new Map(nodes.map((node) => [node.id, node]));
    const edges = fragment.edges.map((edge) => createPastedEdge(edge, nodeIds, edgeIds, pastedNodesById, diagram, offset));
    const groups = fragment.groups.map((group) => createPastedGroup(group, nodeIds, groupIds, offset, validateGroup));
    const fragments = fragment.fragments.map((sourceFragment) => (
        createPastedSequenceFragment(sourceFragment, edgeIds, fragmentIds, validateFragment)
    ));

    return { edges, fragments, groups, nodes };
}
