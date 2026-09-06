export const DIAGRAM_DATA_VERSION = 1;
export const DIAGRAM_TYPES = ['architecture', 'dependency', 'sequence', 'flow', 'entity'];
export const DIAGRAM_ROLES = ['focal', 'backend', 'store', 'external', 'input', 'optional', 'boundary'];
export const DIAGRAM_NODE_KINDS = ['component', 'participant', 'step', 'decision', 'start', 'end', 'state', 'entity'];
export const DIAGRAM_EDGE_KINDS = [
    'connection', 'data', 'dependency', 'cycle', 'call', 'return', 'async', 'success', 'flow', 'transition', 'relationship',
];
export const DIAGRAM_FLOW_PRESETS = ['flowchart', 'state'];
export const DIAGRAM_CARDINALITIES = ['1', 'N', '0..1', '1..*'];
export const DIAGRAM_SEQUENCE_OPERATORS = ['alt', 'opt', 'loop'];
export const DIAGRAM_CONNECTION_SIDES = ['top', 'right', 'bottom', 'left'];
function malformed(field, reason = 'invalid value') {
    throw new Error(`Malformed diagram data: ${field} has ${reason}`);
}
function requireObject(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        malformed(field);
    return value;
}
function requireArray(value, field) {
    if (!Array.isArray(value))
        malformed(field, 'invalid array');
    return value;
}
export function requireDiagramString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        malformed(field, 'invalid string');
    return value;
}
export function optionalDiagramString(value, field) {
    return value === undefined ? undefined : requireDiagramString(value, field);
}
export function optionalDiagramBoolean(value, field) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'boolean')
        malformed(field, 'invalid boolean');
    return value;
}
function optionalNumber(value, field, positive = false) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0))
        malformed(field, 'invalid number');
    return value;
}
export function requireDiagramGridNumber(value, field, positive = false) {
    const result = optionalNumber(value, field, positive);
    if (result === undefined || result % 4 !== 0)
        malformed(field, 'number outside the 4px grid');
    return result;
}
export function requireDiagramRelativeOffset(value, field) {
    const result = optionalNumber(value, field);
    if (result === undefined || result < 0 || result > 1)
        malformed(field, 'number outside the 0..1 range');
    return result;
}
export function requireDiagramEnum(value, values, field) {
    if (typeof value !== 'string' || !values.includes(value))
        malformed(field, `unsupported value ${String(value)}`);
    return value;
}
export function optionalDiagramEnum(value, values, field) {
    return value === undefined ? undefined : requireDiagramEnum(value, values, field);
}
function parseLegend(value) {
    if (value === undefined)
        return undefined;
    const seenSemantics = new Set();
    return requireArray(value, 'meta.legend').map((entry, index) => {
        const field = `meta.legend[${index}]`;
        const item = requireObject(entry, field);
        if ((item.role === undefined) === (item.kind === undefined))
            malformed(field, 'exactly one of role or kind');
        const semantic = item.role === undefined
            ? { kind: requireDiagramEnum(item.kind, DIAGRAM_EDGE_KINDS, `${field}.kind`) }
            : { role: requireDiagramEnum(item.role, DIAGRAM_ROLES, `${field}.role`) };
        const semanticKey = item.role === undefined ? `kind:${semantic.kind}` : `role:${semantic.role}`;
        if (seenSemantics.has(semanticKey))
            malformed(field, `duplicate entry for ${semanticKey}`);
        seenSemantics.add(semanticKey);
        return { ...semantic, label: requireDiagramString(item.label, `${field}.label`) };
    });
}
function parseMeta(value) {
    const meta = requireObject(value, 'meta');
    if (meta.version !== DIAGRAM_DATA_VERSION)
        malformed('meta.version', `unsupported value ${String(meta.version)}`);
    const type = requireDiagramEnum(meta.type, DIAGRAM_TYPES, 'meta.type');
    const preset = optionalDiagramEnum(meta.preset, DIAGRAM_FLOW_PRESETS, 'meta.preset');
    if (type === 'flow' && !preset)
        malformed('meta.preset', 'required value for flow diagrams');
    if (type !== 'flow' && preset)
        malformed('meta.preset', 'value only allowed for flow diagrams');
    const legend = parseLegend(meta.legend);
    return {
        description: requireDiagramString(meta.description, 'meta.description'),
        ...(legend ? { legend } : {}),
        ...(preset ? { preset } : {}),
        title: requireDiagramString(meta.title, 'meta.title'),
        type,
        version: DIAGRAM_DATA_VERSION,
    };
}
function parseEntityFields(value, field) {
    if (value === undefined)
        return undefined;
    return requireArray(value, field).map((entry, index) => {
        const item = requireObject(entry, `${field}[${index}]`);
        const key = optionalDiagramEnum(item.key, ['primary', 'foreign'], `${field}[${index}].key`);
        return {
            ...(key ? { key } : {}),
            name: requireDiagramString(item.name, `${field}[${index}].name`),
            ...(item.type === undefined ? {} : { type: requireDiagramString(item.type, `${field}[${index}].type`) }),
        };
    });
}
function parseNode(value, index) {
    const field = `nodes[${index}]`;
    const node = requireObject(value, field);
    const kind = optionalDiagramEnum(node.kind, DIAGRAM_NODE_KINDS, `${field}.kind`);
    const fields = parseEntityFields(node.fields, `${field}.fields`);
    return {
        ...(node.drilldown === undefined ? {} : { drilldown: optionalDiagramBoolean(node.drilldown, `${field}.drilldown`) }),
        ...(fields ? { fields } : {}),
        ...(node.height === undefined ? {} : { height: requireDiagramGridNumber(node.height, `${field}.height`, true) }),
        id: requireDiagramString(node.id, `${field}.id`),
        ...(kind ? { kind } : {}),
        label: requireDiagramString(node.label, `${field}.label`),
        role: requireDiagramEnum(node.role, DIAGRAM_ROLES, `${field}.role`),
        ...(node.sublabel === undefined ? {} : { sublabel: optionalDiagramString(node.sublabel, `${field}.sublabel`) }),
        ...(node.tag === undefined ? {} : { tag: optionalDiagramString(node.tag, `${field}.tag`) }),
        ...(node.width === undefined ? {} : { width: requireDiagramGridNumber(node.width, `${field}.width`, true) }),
        ...(node.x === undefined ? {} : { x: requireDiagramGridNumber(node.x, `${field}.x`) }),
        ...(node.y === undefined ? {} : { y: requireDiagramGridNumber(node.y, `${field}.y`) }),
    };
}
function parseWaypoints(value, field) {
    if (value === undefined)
        return undefined;
    const waypoints = requireArray(value, field).map((entry, index) => {
        const waypoint = requireObject(entry, `${field}[${index}]`);
        return {
            x: requireDiagramGridNumber(waypoint.x, `${field}[${index}].x`),
            y: requireDiagramGridNumber(waypoint.y, `${field}[${index}].y`),
        };
    });
    if (waypoints.length < 2)
        malformed(field, 'fewer than two points');
    for (let index = 1; index < waypoints.length; index += 1) {
        const previous = waypoints[index - 1];
        const current = waypoints[index];
        if (previous.x !== current.x && previous.y !== current.y)
            malformed(`${field}[${index}]`, 'diagonal segment');
    }
    return waypoints;
}
function parseConnectionPoint(value, field) {
    if (value === undefined)
        return undefined;
    const connectionPoint = requireObject(value, field);
    return {
        nodeId: requireDiagramString(connectionPoint.nodeId, `${field}.nodeId`),
        offset: requireDiagramRelativeOffset(connectionPoint.offset, `${field}.offset`),
        side: requireDiagramEnum(connectionPoint.side, DIAGRAM_CONNECTION_SIDES, `${field}.side`),
    };
}
function parseEdge(value, index) {
    const field = `edges[${index}]`;
    const edge = requireObject(value, field);
    const fromCardinality = optionalDiagramEnum(edge.fromCardinality, DIAGRAM_CARDINALITIES, `${field}.fromCardinality`);
    const sourceAttachment = parseConnectionPoint(edge.sourceAttachment, `${field}.sourceAttachment`);
    const targetAttachment = parseConnectionPoint(edge.targetAttachment, `${field}.targetAttachment`);
    const toCardinality = optionalDiagramEnum(edge.toCardinality, DIAGRAM_CARDINALITIES, `${field}.toCardinality`);
    const waypoints = parseWaypoints(edge.waypoints, `${field}.waypoints`);
    return {
        from: requireDiagramString(edge.from, `${field}.from`),
        ...(fromCardinality ? { fromCardinality } : {}),
        id: requireDiagramString(edge.id, `${field}.id`),
        kind: requireDiagramEnum(edge.kind, DIAGRAM_EDGE_KINDS, `${field}.kind`),
        ...(edge.label === undefined ? {} : { label: requireDiagramString(edge.label, `${field}.label`) }),
        ...(sourceAttachment ? { sourceAttachment } : {}),
        ...(targetAttachment ? { targetAttachment } : {}),
        to: requireDiagramString(edge.to, `${field}.to`),
        ...(toCardinality ? { toCardinality } : {}),
        ...(waypoints ? { waypoints } : {}),
    };
}
function parseGroup(value, index) {
    const field = `groups[${index}]`;
    const group = requireObject(value, field);
    const nodeIds = requireArray(group.nodeIds, `${field}.nodeIds`)
        .map((id, nodeIndex) => requireDiagramString(id, `${field}.nodeIds[${nodeIndex}]`));
    return {
        ...(group.height === undefined ? {} : { height: requireDiagramGridNumber(group.height, `${field}.height`, true) }),
        id: requireDiagramString(group.id, `${field}.id`),
        label: requireDiagramString(group.label, `${field}.label`),
        nodeIds,
        ...(group.width === undefined ? {} : { width: requireDiagramGridNumber(group.width, `${field}.width`, true) }),
        ...(group.x === undefined ? {} : { x: requireDiagramGridNumber(group.x, `${field}.x`) }),
        ...(group.y === undefined ? {} : { y: requireDiagramGridNumber(group.y, `${field}.y`) }),
    };
}
function parseSequenceFragmentRegion(value, fragmentIndex, regionIndex) {
    const field = `fragments[${fragmentIndex}].regions[${regionIndex}]`;
    const region = requireObject(value, field);
    const edgeIds = requireArray(region.edgeIds, `${field}.edgeIds`)
        .map((id, edgeIndex) => requireDiagramString(id, `${field}.edgeIds[${edgeIndex}]`));
    if (edgeIds.length === 0)
        malformed(`${field}.edgeIds`, 'empty array');
    return { edgeIds, guard: requireDiagramString(region.guard, `${field}.guard`) };
}
function parseSequenceFragment(value, index) {
    const field = `fragments[${index}]`;
    const fragment = requireObject(value, field);
    return {
        id: requireDiagramString(fragment.id, `${field}.id`),
        operator: requireDiagramEnum(fragment.operator, DIAGRAM_SEQUENCE_OPERATORS, `${field}.operator`),
        regions: requireArray(fragment.regions, `${field}.regions`)
            .map((region, regionIndex) => parseSequenceFragmentRegion(region, index, regionIndex)),
    };
}
function requireUniqueIds(items, field) {
    const ids = new Set();
    for (const { id } of items) {
        if (ids.has(id))
            malformed(field, `duplicate id ${id}`);
        ids.add(id);
    }
    return ids;
}
function validateReferences(data) {
    const nodeIds = requireUniqueIds(data.nodes, 'nodes');
    if (nodeIds.size === 0)
        malformed('nodes', 'empty array');
    const edgeIds = requireUniqueIds(data.edges, 'edges');
    const duplicateSelectableId = [...edgeIds].find((id) => nodeIds.has(id));
    if (duplicateSelectableId)
        malformed('nodes and edges', `duplicate id ${duplicateSelectableId}`);
    requireUniqueIds(data.groups, 'groups');
    requireUniqueIds(data.fragments ?? [], 'fragments');
    for (const { from, id, sourceAttachment, targetAttachment, to } of data.edges) {
        if (!nodeIds.has(from))
            malformed(`edges.${id}.from`, `unknown node ${from}`);
        if (!nodeIds.has(to))
            malformed(`edges.${id}.to`, `unknown node ${to}`);
        if (sourceAttachment && sourceAttachment.nodeId !== from)
            malformed(`edges.${id}.sourceAttachment.nodeId`, `node ${sourceAttachment.nodeId} does not match from ${from}`);
        if (targetAttachment && targetAttachment.nodeId !== to)
            malformed(`edges.${id}.targetAttachment.nodeId`, `node ${targetAttachment.nodeId} does not match to ${to}`);
    }
    for (const { id, nodeIds: groupNodeIds } of data.groups) {
        for (const nodeId of groupNodeIds) {
            if (!nodeIds.has(nodeId))
                malformed(`groups.${id}.nodeIds`, `unknown node ${nodeId}`);
        }
    }
    for (const fragment of data.fragments ?? []) {
        for (const { edgeIds: regionEdgeIds } of fragment.regions) {
            for (const edgeId of regionEdgeIds) {
                if (!edgeIds.has(edgeId))
                    malformed(`fragments.${fragment.id}.regions.edgeIds`, `unknown edge ${edgeId}`);
            }
        }
    }
}
function validateSequenceFragments(data) {
    const fragments = data.fragments ?? [];
    if (data.meta.type !== 'sequence' && fragments.length > 0)
        malformed('fragments', 'value only allowed for sequence diagrams');
    for (const { id, operator, regions } of fragments) {
        requireDiagramFragmentRegionCount(operator, regions, `fragments.${id}`);
        const edgeIds = regions.flatMap((region) => region.edgeIds);
        if (new Set(edgeIds).size !== edgeIds.length)
            malformed(`fragments.${id}.regions`, 'duplicate edge references');
    }
}
export function requireDiagramEdgeKind(kind, type, field) {
    const edgeKinds = {
        architecture: ['connection', 'data', 'async'],
        dependency: ['dependency', 'cycle'],
        entity: ['relationship'],
        flow: ['flow', 'transition'],
        sequence: ['call', 'return', 'async', 'success'],
    };
    requireDiagramEnum(kind, DIAGRAM_EDGE_KINDS, field);
    if (!edgeKinds[type].includes(kind))
        malformed(field, `unsupported value ${kind} for ${type}`);
    return kind;
}
export function requireDiagramNodeKind(kind, type, preset, field) {
    const defaultNodeKinds = { architecture: 'component', dependency: 'component', entity: 'entity', sequence: 'participant' };
    const defaultNodeKind = defaultNodeKinds[type];
    if (defaultNodeKind && kind !== undefined && kind !== defaultNodeKind)
        malformed(field, `unsupported value ${kind} for ${type}`);
    if (type === 'flow') {
        const allowedKinds = preset === 'state' ? ['start', 'end', 'state'] : ['start', 'end', 'step', 'decision'];
        if (!kind || !allowedKinds.includes(kind))
            malformed(field, `required ${preset} node kind`);
    }
    if (kind !== undefined) requireDiagramEnum(kind, DIAGRAM_NODE_KINDS, field);
    return kind;
}
export function requireDiagramEdgeLabel(label, type, preset, sourceKind, field) {
    if (label !== undefined) requireDiagramString(label, field);
    if (type === 'flow' && preset === 'flowchart' && sourceKind === 'decision' && !label)
        malformed(field, 'required decision branch label');
    if (type === 'flow' && preset === 'state' && !label)
        malformed(field, 'required state transition label');
    return label;
}
export function requireDiagramFragmentRegionCount(operator, regions, field) {
    requireDiagramEnum(operator, DIAGRAM_SEQUENCE_OPERATORS, `${field}.operator`);
    const requiredRegionCount = operator === 'alt' ? 2 : 1;
    if (regions.length !== requiredRegionCount)
        malformed(`${field}.regions`, `expected ${requiredRegionCount} regions`);
}
function validateTypeSpecificData(data) {
    if (data.meta.type !== 'entity' && data.nodes.some(({ fields }) => fields !== undefined)) {
        malformed('nodes.fields', 'value only allowed for entity diagrams');
    }
    if (data.meta.type !== 'entity' && data.edges.some(({ fromCardinality, toCardinality }) => fromCardinality || toCardinality)) {
        malformed('edges.cardinality', 'value only allowed for entity diagrams');
    }
    for (const edge of data.edges) {
        const sourceKind = data.nodes.find(({ id }) => id === edge.from)?.kind;
        requireDiagramEdgeKind(edge.kind, data.meta.type, `edges.${edge.id}.kind`);
        requireDiagramEdgeLabel(edge.label, data.meta.type, data.meta.preset, sourceKind, `edges.${edge.id}.label`);
    }
    for (const node of data.nodes) requireDiagramNodeKind(node.kind, data.meta.type, data.meta.preset, `nodes.${node.id}.kind`);
    (data.meta.legend ?? []).forEach((entry, index) => {
        if (entry.kind !== undefined)
            requireDiagramEdgeKind(entry.kind, data.meta.type, `meta.legend[${index}].kind`);
    });
    validateSequenceFragments(data);
}
export function parseDiagramData(content) {
    let parsedValue;
    try {
        parsedValue = JSON.parse(content);
    }
    catch {
        throw new Error('Malformed diagram data: invalid JSON');
    }
    const root = requireObject(parsedValue, 'root');
    const data = {
        edges: requireArray(root.edges, 'edges').map(parseEdge),
        ...(root.fragments === undefined ? {} : { fragments: requireArray(root.fragments, 'fragments').map(parseSequenceFragment) }),
        groups: root.groups === undefined ? [] : requireArray(root.groups, 'groups').map(parseGroup),
        meta: parseMeta(root.meta),
        nodes: requireArray(root.nodes, 'nodes').map(parseNode),
    };
    validateReferences(data);
    validateTypeSpecificData(data);
    return data;
}
export function serializeDiagramData(data) {
    const canonicalData = parseDiagramData(JSON.stringify(data));

    return `${JSON.stringify(canonicalData, null, 2)}\n`;
}
export function isDiagramDataPath(path) {
    return path.toLowerCase().endsWith('.json');
}
