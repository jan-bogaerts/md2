import type {
    DiagramEdge,
    DiagramEntityField,
    DiagramGroup,
    DiagramNode,
    DiagramSequenceFragment,
    DiagramSequenceFragmentRegion,
} from './diagram_data';
import {
    diagramEditSessionService,
    type DiagramChange,
    type DiagramEditSessionService,
} from './diagram_edit_session_service';

export type DiagramChangeDescriptionReader = Pick<
    DiagramEditSessionService,
    | 'getChange'
    | 'getChangeIdsSnapshot'
    | 'getEdgeIdsSnapshot'
    | 'getEdgeSnapshot'
    | 'getGroupIdsSnapshot'
    | 'getGroupSnapshot'
    | 'getLegendEntryFieldSnapshot'
    | 'getNodeIdsSnapshot'
    | 'getNodeSnapshot'
    | 'getOriginalLegendEntryFieldSnapshot'
>;

interface DiagramDescriptionContext {
    edgeSignatureCounts: ReadonlyMap<string, number>;
    edgesById: ReadonlyMap<string, DiagramEdge>;
    groupLabelCounts: ReadonlyMap<string, number>;
    groupsById: ReadonlyMap<string, DiagramGroup>;
    nodeLabelCounts: ReadonlyMap<string, number>;
    nodesById: ReadonlyMap<string, DiagramNode>;
    reader: DiagramChangeDescriptionReader;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireNode(value: unknown, context: string): DiagramNode {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.label !== 'string') {
        throw new Error(`Diagram change ${context} has invalid node data`);
    }

    return value as unknown as DiagramNode;
}

function requireEdge(value: unknown, context: string): DiagramEdge {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.from !== 'string'
        || typeof value.to !== 'string' || typeof value.kind !== 'string') {
        throw new Error(`Diagram change ${context} has invalid edge data`);
    }

    return value as unknown as DiagramEdge;
}

function requireGroup(value: unknown, context: string): DiagramGroup {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.label !== 'string'
        || !Array.isArray(value.nodeIds)) {
        throw new Error(`Diagram change ${context} has invalid group data`);
    }

    return value as unknown as DiagramGroup;
}

function requireFragment(value: unknown, context: string): DiagramSequenceFragment {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.operator !== 'string'
        || !Array.isArray(value.regions)) {
        throw new Error(`Diagram change ${context} has invalid fragment data`);
    }

    return value as unknown as DiagramSequenceFragment;
}

function incrementCount(counts: Map<string, number>, key: string) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

function edgeSignature(edge: DiagramEdge) {
    return `${edge.label ?? ''}\u0000${edge.kind}\u0000${edge.from}\u0000${edge.to}`;
}

function collectionObject(change: DiagramChange) {
    return change.value ?? change.originalValue;
}

function buildDescriptionContext(reader: DiagramChangeDescriptionReader): DiagramDescriptionContext {
    const nodesById = new Map<string, DiagramNode>();
    const edgesById = new Map<string, DiagramEdge>();
    const groupsById = new Map<string, DiagramGroup>();

    for (const nodeId of reader.getNodeIdsSnapshot()) {
        const node = reader.getNodeSnapshot(nodeId);
        if (node) nodesById.set(nodeId, node as DiagramNode);
    }
    for (const edgeId of reader.getEdgeIdsSnapshot()) {
        const edge = reader.getEdgeSnapshot(edgeId);
        if (edge) edgesById.set(edgeId, edge as DiagramEdge);
    }
    for (const groupId of reader.getGroupIdsSnapshot()) {
        const group = reader.getGroupSnapshot(groupId);
        if (group) groupsById.set(groupId, group as DiagramGroup);
    }
    for (const changeId of reader.getChangeIdsSnapshot()) {
        const change = reader.getChange(changeId);
        if (!change || change.category !== 'collection') continue;

        if (change.objectKind === 'node') {
            const node = requireNode(collectionObject(change as DiagramChange), change.id);
            if (!nodesById.has(node.id)) nodesById.set(node.id, node);
        }
        if (change.objectKind === 'edge') {
            const edge = requireEdge(collectionObject(change as DiagramChange), change.id);
            if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge);
        }
        if (change.objectKind === 'group') {
            const group = requireGroup(collectionObject(change as DiagramChange), change.id);
            if (!groupsById.has(group.id)) groupsById.set(group.id, group);
        }
    }

    const nodeLabelCounts = new Map<string, number>();
    const groupLabelCounts = new Map<string, number>();
    const edgeSignatureCounts = new Map<string, number>();
    for (const { label } of nodesById.values()) incrementCount(nodeLabelCounts, label);
    for (const { label } of groupsById.values()) incrementCount(groupLabelCounts, label);
    for (const edge of edgesById.values()) incrementCount(edgeSignatureCounts, edgeSignature(edge));

    return { edgeSignatureCounts, edgesById, groupLabelCounts, groupsById, nodeLabelCounts, nodesById, reader };
}

function quote(value: string) {
    return JSON.stringify(value);
}

function describeValue(value: unknown): string {
    if (value === undefined) return 'unset';
    if (value === null) return 'null';
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.map(describeValue).join(', ')}]`;
    if (isObject(value)) {
        const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));

        return `{ ${entries.map(([key, item]) => `${key}: ${describeValue(item)}`).join(', ')} }`;
    }

    throw new Error(`Unsupported diagram change value ${String(value)}`);
}

function nodeReference(nodeId: string, context: DiagramDescriptionContext) {
    const node = context.nodesById.get(nodeId);
    if (!node) return `node id ${quote(nodeId)}`;

    const id = context.nodeLabelCounts.get(node.label) === 1 ? '' : ` (id ${quote(node.id)})`;

    return `node ${quote(node.label)}${id}`;
}

function groupReference(groupId: string, context: DiagramDescriptionContext) {
    const group = context.groupsById.get(groupId);
    if (!group) return `group id ${quote(groupId)}`;

    const id = context.groupLabelCounts.get(group.label) === 1 ? '' : ` (id ${quote(group.id)})`;

    return `group ${quote(group.label)}${id}`;
}

function connectionReference(edge: DiagramEdge, context: DiagramDescriptionContext) {
    const label = edge.label ? ` labelled ${quote(edge.label)}` : '';
    const signatureCount = context.edgeSignatureCounts.get(edgeSignature(edge)) ?? 1;
    const id = signatureCount === 1 ? '' : ` (edge id ${quote(edge.id)})`;

    return `${quote(edge.kind)} connection${label} from ${nodeReference(edge.from, context)} `
        + `to ${nodeReference(edge.to, context)}${id}`;
}

function requireContextEdge(edgeId: string, context: DiagramDescriptionContext) {
    const edge = context.edgesById.get(edgeId);
    if (!edge) throw new Error(`Diagram change references missing edge ${edgeId}`);

    return edge;
}

function describeEntityField(field: DiagramEntityField) {
    const key = field.key ? `, key ${quote(field.key)}` : '';
    const type = field.type ? `, type ${quote(field.type)}` : '';

    return `{ name: ${quote(field.name)}${type}${key} }`;
}

function describeEntityFields(value: unknown, changeId: string) {
    if (!Array.isArray(value) || value.some((field) => !isObject(field) || typeof field.name !== 'string')) {
        throw new Error(`Diagram change ${changeId} has invalid entity fields`);
    }

    return `[${value.map((field) => describeEntityField(field as unknown as DiagramEntityField)).join(', ')}]`;
}

function describeNodeCollection(change: DiagramChange, context: DiagramDescriptionContext) {
    const node = requireNode(collectionObject(change), change.id);
    const action = change.value === null ? 'Remove' : 'Add';
    const details = [
        `role ${quote(node.role)}`,
        ...(node.kind ? [`kind ${quote(node.kind)}`] : []),
        ...(node.sublabel ? [`sublabel ${quote(node.sublabel)}`] : []),
        ...(node.tag ? [`tag ${quote(node.tag)}`] : []),
        ...(node.drilldown !== undefined ? [`drilldown ${String(node.drilldown)}`] : []),
        ...(node.x !== undefined && node.y !== undefined ? [`diagram position (${node.x}, ${node.y})`] : []),
        ...(node.width !== undefined && node.height !== undefined ? [`diagram size ${node.width} x ${node.height}`] : []),
        ...(node.fields ? [`fields ${describeEntityFields(node.fields, change.id)}`] : []),
    ];

    return `${action} ${nodeReference(node.id, context)} with ${details.join(', ')}.`;
}

function describeEdgeCollection(change: DiagramChange, context: DiagramDescriptionContext) {
    const edge = requireEdge(collectionObject(change), change.id);
    const action = change.value === null ? 'Remove' : 'Add';
    const details = [
        ...(edge.fromCardinality ? [`source cardinality ${quote(edge.fromCardinality)}`] : []),
        ...(edge.toCardinality ? [`target cardinality ${quote(edge.toCardinality)}`] : []),
        ...(edge.sourceAttachment ? [`source attachment ${describeValue(edge.sourceAttachment)}`] : []),
        ...(edge.targetAttachment ? [`target attachment ${describeValue(edge.targetAttachment)}`] : []),
        ...(edge.waypoints ? [`diagram waypoints ${describeValue(edge.waypoints)}`] : []),
    ];
    const suffix = details.length > 0 ? ` with ${details.join(', ')}` : '';

    return `${action} ${connectionReference(edge, context)}${suffix}.`;
}

function describeGroupCollection(change: DiagramChange, context: DiagramDescriptionContext) {
    const group = requireGroup(collectionObject(change), change.id);
    const action = change.value === null ? 'Remove' : 'Add';
    const members = group.nodeIds.map((nodeId) => nodeReference(nodeId, context)).join(', ');
    const geometry = ['x', 'y', 'width', 'height']
        .filter((field) => group[field as keyof DiagramGroup] !== undefined)
        .map((field) => `${field} ${String(group[field as keyof DiagramGroup])}`);
    const details = [`members [${members}]`, ...geometry];

    return `${action} ${groupReference(group.id, context)} with ${details.join(', ')}.`;
}

function describeRegion(region: DiagramSequenceFragmentRegion, context: DiagramDescriptionContext) {
    const edges = region.edgeIds.map((edgeId) => connectionReference(requireContextEdge(edgeId, context), context));

    return `{ guard: ${quote(region.guard)}, connections: [${edges.join(', ')}] }`;
}

function describeFragmentCollection(change: DiagramChange, context: DiagramDescriptionContext) {
    const fragment = requireFragment(collectionObject(change), change.id);
    const action = change.value === null ? 'Remove' : 'Add';
    const regions = fragment.regions.map((region) => describeRegion(region, context));

    return `${action} fragment id ${quote(fragment.id)} with operator ${quote(fragment.operator)} and regions [${regions.join(', ')}].`;
}

function describeCollectionChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (change.objectKind === 'node') return describeNodeCollection(change, context);
    if (change.objectKind === 'edge') return describeEdgeCollection(change, context);
    if (change.objectKind === 'group') return describeGroupCollection(change, context);
    if (change.objectKind === 'fragment') return describeFragmentCollection(change, context);

    throw new Error(`Diagram collection change ${change.id} has unsupported object kind ${change.objectKind}`);
}

function changedValueSentence(subject: string, field: string, change: DiagramChange) {
    return `Change ${field} of ${subject} from ${describeValue(change.originalValue)} to ${describeValue(change.value)}.`;
}

function describeMetadataField(change: DiagramChange) {
    return changedValueSentence('diagram metadata', String(change.field), change);
}

function describeNodeField(change: DiagramChange, context: DiagramDescriptionContext) {
    const subject = nodeReference(change.objectId, context);
    if (change.field === 'x' || change.field === 'y') {
        return `Move ${subject}: change diagram ${change.field}-coordinate from ${describeValue(change.originalValue)} `
            + `to ${describeValue(change.value)}.`;
    }
    if (change.field === 'width' || change.field === 'height') {
        return `Resize ${subject}: change diagram ${change.field} from ${describeValue(change.originalValue)} `
            + `to ${describeValue(change.value)}.`;
    }

    return changedValueSentence(subject, String(change.field), change);
}

function describeGroupField(change: DiagramChange, context: DiagramDescriptionContext) {
    const subject = groupReference(change.objectId, context);
    if (change.field === 'x' || change.field === 'y') {
        return `Move ${subject}: change diagram ${change.field}-coordinate from ${describeValue(change.originalValue)} `
            + `to ${describeValue(change.value)}.`;
    }
    if (change.field === 'width' || change.field === 'height') {
        return `Resize ${subject}: change diagram ${change.field} from ${describeValue(change.originalValue)} `
            + `to ${describeValue(change.value)}.`;
    }

    return changedValueSentence(subject, String(change.field), change);
}

function edgeWithField(edge: DiagramEdge, field: string, value: unknown) {
    return { ...edge, [field]: value } as DiagramEdge;
}

function describeEdgeField(change: DiagramChange, context: DiagramDescriptionContext) {
    const edge = requireContextEdge(change.objectId, context);
    if (change.field === 'from' || change.field === 'to' || change.field === 'kind') {
        const originalEdge = edgeWithField(edge, change.field, change.originalValue);

        return `Change connection from ${connectionReference(originalEdge, context)} to ${connectionReference(edge, context)}.`;
    }
    if (change.field === 'row') {
        return `Move ${connectionReference(edge, context)} from sequence row ${describeValue(change.originalValue)} `
            + `to row ${describeValue(change.value)}.`;
    }

    return changedValueSentence(connectionReference(edge, context), String(change.field), change);
}

function parseEntityFieldObjectId(objectId: string) {
    const match = /^(.*)\[(\d+)\]$/u.exec(objectId);
    if (!match) throw new Error(`Invalid entity field identity ${objectId}`);

    return { fieldIndex: Number(match[2]), nodeId: match[1] };
}

function describeEntityFieldChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (change.category === 'membership') {
        return `Replace fields of ${nodeReference(change.objectId, context)} from `
            + `${describeEntityFields(change.originalValue, change.id)} to ${describeEntityFields(change.value, change.id)}.`;
    }

    const { fieldIndex, nodeId } = parseEntityFieldObjectId(change.objectId);
    const subject = `field at index ${fieldIndex} in ${nodeReference(nodeId, context)}`;

    return changedValueSentence(subject, String(change.field), change);
}

function parseConnectionPointObjectId(objectId: string) {
    const endpoints = ['sourceAttachment', 'targetAttachment'] as const;
    const endpoint = endpoints.find((candidate) => objectId.endsWith(`:${candidate}`));
    if (!endpoint) throw new Error(`Invalid connection point identity ${objectId}`);

    return { edgeId: objectId.slice(0, -(endpoint.length + 1)), endpoint };
}

function describeConnectionPointChange(change: DiagramChange, context: DiagramDescriptionContext) {
    const { edgeId, endpoint } = parseConnectionPointObjectId(change.objectId);
    const edge = requireContextEdge(edgeId, context);
    const attachment = endpoint === 'sourceAttachment' ? 'source attachment' : 'target attachment';
    if (change.field === 'nodeId') {
        return `For ${connectionReference(edge, context)}, change ${attachment} node from `
            + `${nodeReference(String(change.originalValue), context)} to ${nodeReference(String(change.value), context)}.`;
    }

    return changedValueSentence(`${attachment} of ${connectionReference(edge, context)}`, String(change.field), change);
}

function legendSemantic(entryKey: string) {
    if (entryKey.startsWith('node:')) return `node role ${quote(entryKey.slice('node:'.length))}`;
    if (entryKey.startsWith('connection:')) return `connection kind ${quote(entryKey.slice('connection:'.length))}`;

    throw new Error(`Invalid legend entry identity ${entryKey}`);
}

function legendEntryReference(entryKey: string, context: DiagramDescriptionContext, original: boolean) {
    const getter = original
        ? context.reader.getOriginalLegendEntryFieldSnapshot
        : context.reader.getLegendEntryFieldSnapshot;
    const label = getter(entryKey, 'label');
    const labelled = label ? ` ${quote(label)}` : '';

    return `legend entry${labelled} for ${legendSemantic(entryKey)}`;
}

function describeLegendChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (change.category === 'membership') {
        const adding = change.value === true;
        const entry = legendEntryReference(change.objectId, context, !adding);

        return `${adding ? 'Add' : 'Remove'} ${entry}.`;
    }
    if (change.field === 'order') {
        const entry = legendEntryReference(change.objectId, context, false);

        return `Move ${entry} from index ${describeValue(change.originalValue)} to index ${describeValue(change.value)}.`;
    }

    return changedValueSentence(legendEntryReference(change.objectId, context, false), String(change.field), change);
}

function describeGroupMembership(change: DiagramChange, context: DiagramDescriptionContext) {
    if (!change.ownerId) throw new Error(`Diagram group membership change ${change.id} has no owner`);

    return `${change.value === true ? 'Add' : 'Remove'} ${nodeReference(change.objectId, context)} `
        + `${change.value === true ? 'to' : 'from'} ${groupReference(change.ownerId, context)}.`;
}

function describeFragmentMembership(change: DiagramChange, context: DiagramDescriptionContext) {
    if (!change.ownerId || change.regionIndex === null) {
        throw new Error(`Diagram fragment membership change ${change.id} has no region owner`);
    }
    const edge = requireContextEdge(change.objectId, context);

    return `${change.value === true ? 'Add' : 'Remove'} ${connectionReference(edge, context)} `
        + `${change.value === true ? 'to' : 'from'} region index ${change.regionIndex} of fragment id ${quote(change.ownerId)}.`;
}

function describeMembershipChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (change.objectKind === 'legendEntry') return describeLegendChange(change, context);
    if (change.objectKind === 'entityField') return describeEntityFieldChange(change, context);
    if (change.objectKind === 'node' && change.field === 'nodeIds') return describeGroupMembership(change, context);
    if (change.objectKind === 'edge' && change.field === 'edgeIds') return describeFragmentMembership(change, context);

    throw new Error(`Diagram membership change ${change.id} has unsupported object kind ${change.objectKind}`);
}

function describeFragmentField(change: DiagramChange, context: DiagramDescriptionContext) {
    const region = change.regionIndex === null ? '' : ` region index ${change.regionIndex}`;
    const subject = `fragment id ${quote(change.objectId)}${region}`;
    if (change.field === 'edgeIds') {
        const original = Array.isArray(change.originalValue)
            ? change.originalValue.map((edgeId) => connectionReference(requireContextEdge(String(edgeId), context), context))
            : [];
        const value = Array.isArray(change.value)
            ? change.value.map((edgeId) => connectionReference(requireContextEdge(String(edgeId), context), context))
            : [];

        return `Set ordered connections of ${subject} from [${original.join(', ')}] to [${value.join(', ')}].`;
    }

    return changedValueSentence(subject, String(change.field), change);
}

function describeFieldChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (!change.field) throw new Error(`Diagram field change ${change.id} has no field`);
    if (change.objectKind === 'meta') return describeMetadataField(change);
    if (change.objectKind === 'node') return describeNodeField(change, context);
    if (change.objectKind === 'group') return describeGroupField(change, context);
    if (change.objectKind === 'edge') return describeEdgeField(change, context);
    if (change.objectKind === 'connectionPoint') return describeConnectionPointChange(change, context);
    if (change.objectKind === 'entityField') return describeEntityFieldChange(change, context);
    if (change.objectKind === 'legendEntry') return describeLegendChange(change, context);
    if (change.objectKind === 'fragment') return describeFragmentField(change, context);

    throw new Error(`Diagram field change ${change.id} has unsupported object kind ${change.objectKind}`);
}

function describeChange(change: DiagramChange, context: DiagramDescriptionContext) {
    if (change.category === 'collection') return describeCollectionChange(change, context);
    if (change.category === 'membership') return describeMembershipChange(change, context);
    if (change.category === 'field') return describeFieldChange(change, context);

    throw new Error(`Diagram change ${change.id} has unsupported category ${change.category}`);
}

/** Generates one semantic instruction without retaining report state. */
export function generateDiagramChangeDescription(
    changeId: string,
    reader: DiagramChangeDescriptionReader = diagramEditSessionService,
) {
    const change = reader.getChange(changeId);
    if (!change) throw new Error(`Diagram change ${changeId} does not exist`);

    return describeChange(change as DiagramChange, buildDescriptionContext(reader));
}

/** Generates final agent text only when explicitly called. Empty change sets produce no instructions. */
export function generateDiagramChangeDescriptions(
    reader: DiagramChangeDescriptionReader = diagramEditSessionService,
) {
    const context = buildDescriptionContext(reader);
    const changeIds = [...reader.getChangeIdsSnapshot()].sort();

    return changeIds.map((changeId) => {
        const change = reader.getChange(changeId);
        if (!change) throw new Error(`Diagram change ${changeId} does not exist`);

        return `- ${describeChange(change as DiagramChange, context)}`;
    }).join('\n');
}
