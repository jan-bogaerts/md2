import {
    DIAGRAM_CARDINALITIES,
    DIAGRAM_CONNECTION_SIDES,
    DIAGRAM_EDGE_KINDS,
    DIAGRAM_ROLES,
    optionalDiagramBoolean,
    optionalDiagramEnum,
    optionalDiagramString,
    requireDiagramEdgeKind,
    requireDiagramEdgeLabel,
    requireDiagramEnum,
    requireDiagramFragmentRegionCount,
    requireDiagramGridNumber,
    requireDiagramNodeKind,
    requireDiagramRelativeOffset,
    requireDiagramString,
    type DiagramData,
    type DiagramEdge,
    type DiagramEntityField,
    type DiagramNode,
} from './diagram_data';
import type {
    DiagramConnectionEndpoint,
    MutableDiagramConnectionPointField,
    MutableDiagramEdgeField,
    MutableDiagramNodeField,
    NewDiagramEdge,
    NewDiagramSequenceFragment,
    NewDiagramGroup,
    NewDiagramLegendEntry,
    NewDiagramNode,
} from './diagram_edit_types';

export function invalidDiagramField(field: string, reason: string): never {
    throw new Error(`Malformed diagram data: ${field} has ${reason}`)
}

export function validationMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    return message.replace(/^Malformed diagram data: /u, '')
}

export function requireOptionalGridNumber(value: unknown, field: string, positive = false) {
    if (value !== undefined) requireDiagramGridNumber(value, field, positive)
}

export function requireEntityFieldValue(field: keyof DiagramEntityField, value: unknown, fieldPath: string) {
    if (field === 'key') optionalDiagramEnum(value, ['primary', 'foreign'], fieldPath)
    if (field === 'name') requireDiagramString(value, fieldPath)
    if (field === 'type') optionalDiagramString(value, fieldPath)
}

export function validateConnectionPointValue(
    edge: DiagramEdge,
    endpoint: DiagramConnectionEndpoint,
    field: MutableDiagramConnectionPointField,
    value: unknown,
) {
    const fieldPath = `edges.${edge.id}.${endpoint}.${field}`
    if (field === 'nodeId') {
        const nodeId = requireDiagramString(value, fieldPath)
        const expectedNodeId = endpoint === 'sourceAttachment' ? edge.from : edge.to
        if (nodeId !== expectedNodeId) invalidDiagramField(fieldPath, `node ${nodeId} does not match endpoint ${expectedNodeId}`)
    }
    if (field === 'offset') requireDiagramRelativeOffset(value, fieldPath)
    if (field === 'side') requireDiagramEnum(value, DIAGRAM_CONNECTION_SIDES, fieldPath)
}

export function validateNewGroup(group: NewDiagramGroup) {
    requireDiagramString(group.label, 'groups.new.label')
    requireOptionalGridNumber(group.height, 'groups.new.height', true)
    requireOptionalGridNumber(group.width, 'groups.new.width', true)
    requireOptionalGridNumber(group.x, 'groups.new.x')
    requireOptionalGridNumber(group.y, 'groups.new.y')
}

export function validateNewLegendEntry(entry: NewDiagramLegendEntry) {
    if ('role' in entry) requireDiagramEnum(entry.role, DIAGRAM_ROLES, 'meta.legend.new.role')
    else requireDiagramEnum(entry.kind, DIAGRAM_EDGE_KINDS, 'meta.legend.new.kind')
    if (entry.label !== undefined) requireDiagramString(entry.label, 'meta.legend.new.label')
}

/** Validates diagram edits against the active model and its node index. */
export class DiagramEditValidation {
    private readonly diagram: DiagramData;
    private readonly nodesById: ReadonlyMap<string, DiagramNode>;

    constructor(
        diagram: DiagramData,
        nodesById: ReadonlyMap<string, DiagramNode>,
    ) {
        this.diagram = diagram;
        this.nodesById = nodesById;
    }

    validateNodeFieldValue(nodeId: string, field: MutableDiagramNodeField, value: unknown) {
        const diagram = this.diagram
        const fieldPath = `nodes.${nodeId}.${field}`
        if (field === 'drilldown') optionalDiagramBoolean(value, fieldPath)
        if (field === 'height' || field === 'width') requireOptionalGridNumber(value, fieldPath, true)
        if (field === 'kind') {
            requireDiagramNodeKind(value, diagram.meta.type, diagram.meta.preset, fieldPath)
            for (const edge of diagram.edges) {
                if (edge.from === nodeId) {
                    requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, value as DiagramNode['kind'], `edges.${edge.id}.label`)
                }
            }
        }
        if (field === 'label') requireDiagramString(value, fieldPath)
        if (field === 'role') requireDiagramEnum(value, DIAGRAM_ROLES, fieldPath)
        if (field === 'sublabel' || field === 'tag') optionalDiagramString(value, fieldPath)
        if (field === 'x' || field === 'y') requireOptionalGridNumber(value, fieldPath)
    }

    validateEdgeFieldValue(edge: DiagramEdge, field: MutableDiagramEdgeField, value: unknown) {
        const diagram = this.diagram
        const fieldPath = `edges.${edge.id}.${field}`
        if (field === 'from' || field === 'to') {
            const nodeId = requireDiagramString(value, fieldPath)
            if (!this.nodesById.has(nodeId)) invalidDiagramField(fieldPath, `unknown node ${nodeId}`)
            const attachment = field === 'from' ? edge.sourceAttachment : edge.targetAttachment
            if (attachment && attachment.nodeId !== nodeId) {
                invalidDiagramField(`${fieldPath === `edges.${edge.id}.from` ? `edges.${edge.id}.sourceAttachment` : `edges.${edge.id}.targetAttachment`}.nodeId`, `node ${attachment.nodeId} does not match ${field} ${nodeId}`)
            }
            if (field === 'from') {
                const source = this.nodesById.get(nodeId)
                requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, source?.kind, `edges.${edge.id}.label`)
            }
        }
        if (field === 'kind') requireDiagramEdgeKind(value, diagram.meta.type, fieldPath)
        if (field === 'label') {
            const source = this.nodesById.get(edge.from)
            requireDiagramEdgeLabel(value, diagram.meta.type, diagram.meta.preset, source?.kind, fieldPath)
        }
        if (field === 'fromCardinality' || field === 'toCardinality') {
            optionalDiagramEnum(value, DIAGRAM_CARDINALITIES, fieldPath)
            if (value !== undefined && diagram.meta.type !== 'entity') {
                invalidDiagramField(fieldPath, 'value only allowed for entity diagrams')
            }
        }
    }

    validateNewNode(node: NewDiagramNode) {
        this.validateNodeFieldValue('new', 'label', node.label)
        this.validateNodeFieldValue('new', 'role', node.role)
        this.validateNodeFieldValue('new', 'kind', node.kind)
        this.validateNodeFieldValue('new', 'drilldown', node.drilldown)
        this.validateNodeFieldValue('new', 'height', node.height)
        this.validateNodeFieldValue('new', 'sublabel', node.sublabel)
        this.validateNodeFieldValue('new', 'tag', node.tag)
        this.validateNodeFieldValue('new', 'width', node.width)
        this.validateNodeFieldValue('new', 'x', node.x)
        this.validateNodeFieldValue('new', 'y', node.y)
        const diagram = this.diagram
        if (node.fields !== undefined && diagram.meta.type !== 'entity') {
            invalidDiagramField('nodes.new.fields', 'value only allowed for entity diagrams')
        }
        for (let index = 0; index < (node.fields?.length ?? 0); index += 1) {
            const entityField = node.fields?.[index] as DiagramEntityField
            requireEntityFieldValue('key', entityField.key, `nodes.new.fields[${index}].key`)
            requireEntityFieldValue('name', entityField.name, `nodes.new.fields[${index}].name`)
            requireEntityFieldValue('type', entityField.type, `nodes.new.fields[${index}].type`)
        }
        this.validateMindmapNode({ ...node, id: 'new' }, 'new')
    }

    validateMindmapNode(node: DiagramNode, nodeId: string) {
        const diagram = this.diagram
        if (diagram.meta.type !== 'mindmap') return
        if ((node.width === undefined) !== (node.height === undefined)) {
            invalidDiagramField(`nodes.${nodeId}.dimensions`, 'width and height must be supplied together')
        }
        const otherRootCount = diagram.nodes.filter(({ id, kind }) => id !== nodeId && kind === 'root').length
        const rootCount = otherRootCount + (node.kind === 'root' ? 1 : 0)
        if (rootCount !== 1) invalidDiagramField('nodes', `expected exactly one root, found ${rootCount}`)
    }

    validateNewEdge(edge: NewDiagramEdge) {
        const candidate = { ...edge, id: 'new' }
        this.validateEdgeFieldValue(candidate, 'from', edge.from)
        this.validateEdgeFieldValue(candidate, 'to', edge.to)
        this.validateEdgeFieldValue(candidate, 'kind', edge.kind)
        this.validateEdgeFieldValue(candidate, 'label', edge.label)
        this.validateEdgeFieldValue(candidate, 'fromCardinality', edge.fromCardinality)
        this.validateEdgeFieldValue(candidate, 'toCardinality', edge.toCardinality)
        if (edge.sourceAttachment) {
            validateConnectionPointValue(candidate, 'sourceAttachment', 'nodeId', edge.sourceAttachment.nodeId)
            validateConnectionPointValue(candidate, 'sourceAttachment', 'offset', edge.sourceAttachment.offset)
            validateConnectionPointValue(candidate, 'sourceAttachment', 'side', edge.sourceAttachment.side)
        }
        if (edge.targetAttachment) {
            validateConnectionPointValue(candidate, 'targetAttachment', 'nodeId', edge.targetAttachment.nodeId)
            validateConnectionPointValue(candidate, 'targetAttachment', 'offset', edge.targetAttachment.offset)
            validateConnectionPointValue(candidate, 'targetAttachment', 'side', edge.targetAttachment.side)
        }
        for (let index = 0; index < (edge.waypoints?.length ?? 0); index += 1) {
            const waypoint = edge.waypoints?.[index]
            if (!waypoint) continue
            requireDiagramGridNumber(waypoint.x, `edges.new.waypoints[${index}].x`)
            requireDiagramGridNumber(waypoint.y, `edges.new.waypoints[${index}].y`)
            const previous = edge.waypoints?.[index - 1]
            if (previous && previous.x !== waypoint.x && previous.y !== waypoint.y) {
                invalidDiagramField(`edges.new.waypoints[${index}]`, 'diagonal segment')
            }
        }
        if (edge.waypoints && edge.waypoints.length < 2) invalidDiagramField('edges.new.waypoints', 'fewer than two points')
    }

    validateNewFragment(fragment: NewDiagramSequenceFragment) {
        this.validateFragment(fragment, 'fragments.new')
    }

    validateFragment(fragment: NewDiagramSequenceFragment, fieldPath: string) {
        const diagram = this.diagram
        if (diagram.meta.type !== 'sequence') invalidDiagramField('fragments', 'value only allowed for sequence diagrams')
        requireDiagramFragmentRegionCount(fragment.operator, fragment.regions, fieldPath)
        for (let index = 0; index < fragment.regions.length; index += 1) {
            const region = fragment.regions[index]
            requireDiagramString(region.guard, `${fieldPath}.regions[${index}].guard`)
            if (region.edgeIds.length === 0) invalidDiagramField(`${fieldPath}.regions[${index}].edgeIds`, 'empty array')
        }
    }

}
