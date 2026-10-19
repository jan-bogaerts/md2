import { requireDiagramString, type DiagramEdge, type DiagramGroup, type DiagramMeta, type DiagramNode } from './diagram_data'
import { DiagramEditContext } from './diagram_edit_context'
import { diagramConnectionPointFieldChangedEvent, diagramMetadataFieldChangedEvent, diagramObjectFieldChangedEvent } from './diagram_edit_events'
import { groupMembershipEvent, collectionMembershipEvent } from './diagram_edit_membership_events'
import { invalidDiagramField, requireOptionalGridNumber, validateConnectionPointValue } from './diagram_edit_validation'
import { planEdgeReconnection } from './diagram_edge_reconnection_plan'
import type { DiagramChange, DiagramConnectionEndpoint, DiagramFieldChangeDetail, MutableDiagramEdgeField, MutableDiagramGroupField, MutableDiagramMetaField, MutableDiagramNodeField } from './diagram_edit_types'

function frozenIds<Item extends { id: string }>(items: readonly Item[]) {
    return Object.freeze(items.map(({ id }) => id))
}

/** Edits the session-owned canonical diagram. */
export class DiagramObjectFieldEditor {
    private readonly context: DiagramEditContext

    constructor(context: DiagramEditContext) { this.context = context }

    setMetadataField<Field extends MutableDiagramMetaField>(field: Field, value: DiagramMeta[Field]) {
        const diagram = this.context.diagram
        const previousValue = diagram.meta[field]
        const trimmedValue = value.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.context.validateOperation('Set diagram metadata field', () => requireDiagramString(trimmedValue, `meta.${field}`))) return false

        diagram.meta[field] = trimmedValue
        const originalValue = this.context.changeRegistry.baseline?.meta[field]
        const eventName = diagramMetadataFieldChangedEvent(field)
        this.context.transaction.finishFieldChange(eventName, 'meta:diagram', 'meta', 'diagram', field, originalValue, previousValue, trimmedValue)

        return true
    }

    setNodeField<Field extends MutableDiagramNodeField>(nodeId: string, field: Field, value: DiagramNode[Field]) {
        const node = this.context.getNode(nodeId)
        const previousValue = node[field]
        if (Object.is(previousValue, value)) return false
        if (!this.context.validateOperation('Set node field', () => {
            this.context.validation.validateNodeFieldValue(nodeId, field, value)
            this.context.validation.validateMindmapNode({ ...node, [field]: value }, nodeId)
        })) return false

        node[field] = value
        const originalValue = this.context.changeRegistry.originalNodes.get(nodeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('node', nodeId, field)
        this.context.transaction.finishFieldChange(eventName, `node:${nodeId}`, 'node', nodeId, field, originalValue, previousValue, value)

        return true
    }

    /** Writes both node dimensions through one validated transaction for aspect-locked shapes. */
    setNodeSize(nodeId: string, width: number | undefined, height: number | undefined) {
        const node = this.context.getNode(nodeId)
        const previousWidth = node.width
        const previousHeight = node.height
        if (Object.is(previousWidth, width) && Object.is(previousHeight, height)) return false
        if (!this.context.validateOperation('Set node size', () => {
            this.context.validation.validateNodeFieldValue(nodeId, 'width', width)
            this.context.validation.validateNodeFieldValue(nodeId, 'height', height)
            this.context.validation.validateMindmapNode({ ...node, height, width }, nodeId)
        })) return false

        node.width = width
        node.height = height
        const original = this.context.changeRegistry.originalNodes.get(nodeId)
        const changes = [
            { field: 'width' as const, originalValue: original?.width, previousValue: previousWidth, value: width },
            { field: 'height' as const, originalValue: original?.height, previousValue: previousHeight, value: height },
        ].filter(({ previousValue, value }) => !Object.is(previousValue, value))
        for (const change of changes) {
            const eventName = diagramObjectFieldChangedEvent('node', nodeId, change.field)
            const diagramChange: DiagramChange = {
                category: 'field', field: change.field, id: eventName, objectId: nodeId, objectKind: 'node',
                originalValue: change.originalValue, ownerId: null, regionIndex: null, value: change.value,
            }
            this.context.changeRegistry.set(diagramChange, `node:${nodeId}`, Object.is(change.originalValue, change.value))
        }
        this.context.transaction.commit([])
        for (const change of changes) {
            const eventName = diagramObjectFieldChangedEvent('node', nodeId, change.field)
            const detail: DiagramFieldChangeDetail = {
                field: change.field, objectId: nodeId, objectKind: 'node',
                previousValue: change.previousValue, value: change.value,
            }
            this.context.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }))
        }

        return true
    }

    setEdgeField<Field extends MutableDiagramEdgeField>(edgeId: string, field: Field, value: DiagramEdge[Field]) {
        const edge = this.context.getEdge(edgeId)
        const previousValue = edge[field]
        if (Object.is(previousValue, value)) return false
        if (!this.context.validateOperation('Set edge field', () => this.context.validation.validateEdgeFieldValue(edge, field, value))) return false

        edge[field] = value
        const originalValue = this.context.changeRegistry.originalEdges.get(edgeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('edge', edgeId, field)
        this.context.transaction.finishFieldChange(eventName, `edge:${edgeId}`, 'edge', edgeId, field, originalValue, previousValue, value)

        return true
    }

    /** Reassigns one edge endpoint and its explicit attachment in one validated transaction. */
    reconnectEdgeEndpoint(edgeId: string, endpoint: DiagramConnectionEndpoint, nodeId: string) {
        const edge = this.context.getEdge(edgeId)
        const plan = planEdgeReconnection(edge, endpoint, nodeId)
        if (!plan) return false

        const { attachment, candidate, edgeField, previousNodeId } = plan
        if (!this.context.validateOperation('Reconnect edge endpoint', () => {
            this.context.validation.validateEdgeFieldValue(candidate, edgeField, nodeId)
            if (attachment) validateConnectionPointValue(candidate, endpoint, 'nodeId', nodeId)
        })) return false

        edge[edgeField] = nodeId
        if (attachment) attachment.nodeId = nodeId

        const originalEdge = this.context.changeRegistry.originalEdges.get(edgeId)
        const edgeEventName = diagramObjectFieldChangedEvent('edge', edgeId, edgeField)
        const edgeChange: DiagramChange = {
            category: 'field',
            field: edgeField,
            id: edgeEventName,
            objectId: edgeId,
            objectKind: 'edge',
            originalValue: originalEdge?.[edgeField],
            ownerId: null,
            regionIndex: null,
            value: nodeId,
        }
        this.context.changeRegistry.set(edgeChange, `edge:${edgeId}`, Object.is(originalEdge?.[edgeField], nodeId))

        const connectionEventName = attachment
            ? diagramConnectionPointFieldChangedEvent(edgeId, endpoint, 'nodeId')
            : null
        if (connectionEventName) {
            const connectionChange: DiagramChange = {
                category: 'field',
                field: 'nodeId',
                id: connectionEventName,
                objectId: `${edgeId}:${endpoint}`,
                objectKind: 'connectionPoint',
                originalValue: originalEdge?.[endpoint]?.nodeId,
                ownerId: null,
                regionIndex: null,
                value: nodeId,
            }
            this.context.changeRegistry.set(
                connectionChange,
                `edge:${edgeId}`,
                Object.is(originalEdge?.[endpoint]?.nodeId, nodeId),
            )
        }

        this.context.transaction.commit([])
        const edgeDetail: DiagramFieldChangeDetail = {
            field: edgeField,
            objectId: edgeId,
            objectKind: 'edge',
            previousValue: previousNodeId,
            value: nodeId,
        }
        this.context.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(edgeEventName, { detail: edgeDetail }))
        if (connectionEventName) {
            const connectionDetail: DiagramFieldChangeDetail = {
                field: 'nodeId',
                objectId: `${edgeId}:${endpoint}`,
                objectKind: 'connectionPoint',
                previousValue: previousNodeId,
                value: nodeId,
            }
            this.context.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(connectionEventName, { detail: connectionDetail }))
        }

        return true
    }

    setGroupField<Field extends MutableDiagramGroupField>(groupId: string, field: Field, value: DiagramGroup[Field]) {
        const group = this.context.getGroup(groupId)
        const previousValue = group[field]
        if (Object.is(previousValue, value)) return false
        if (!this.context.validateOperation('Set group field', () => {
            const fieldPath = `groups.${groupId}.${field}`
            if (field === 'label') requireDiagramString(value, fieldPath)
            if (field === 'height' || field === 'width') requireOptionalGridNumber(value, fieldPath, true)
            if (field === 'x' || field === 'y') requireOptionalGridNumber(value, fieldPath)
        })) return false

        group[field] = value
        const originalValue = this.context.changeRegistry.originalGroups.get(groupId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('group', groupId, field)
        this.context.transaction.finishFieldChange(eventName, `group:${groupId}`, 'group', groupId, field, originalValue, previousValue, value)

        return true
    }

    /** Moves one existing sequence message to another persisted row without changing its identity. */
    moveSequenceEdge(edgeId: string, rowIndex: number): boolean {
        const diagram = this.context.diagram
        const edge = this.context.getEdge(edgeId)
        const previousRowIndex = diagram.edges.indexOf(edge)
        if (!this.context.validateOperation('Move sequence edge', () => {
            if (diagram.meta.type !== 'sequence') invalidDiagramField(`edges.${edgeId}.row`, 'value only allowed for sequence diagrams')
            if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= diagram.edges.length) {
                invalidDiagramField(`edges.${edgeId}.row`, `index ${rowIndex} outside the 0..${diagram.edges.length - 1} range`)
            }
        })) return false
        if (rowIndex === previousRowIndex) return false

        diagram.edges.splice(previousRowIndex, 1)
        diagram.edges.splice(rowIndex, 0, edge)
        this.context.setEdgeIds(frozenIds(diagram.edges))
        this.context.changeRegistry.markSequenceEdgeOrderChanges()
        this.context.transaction.commit([collectionMembershipEvent('edge', [], [])])

        return true
    }

    /** Adds one node to one group; the node object and every other collection keep their references. */
    addGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.context.getGroup(groupId)
        if (group.nodeIds.includes(nodeId)) return false
        if (!this.context.validateOperation('Add group member', () => {
            if (!this.context.hasNode(nodeId)) invalidDiagramField(`groups.${groupId}.nodeIds`, `unknown node ${nodeId}`)
        })) return false

        group.nodeIds.push(nodeId)
        this.context.setGroupNodeIds(groupId, Object.freeze([...group.nodeIds]))
        this.context.changeRegistry.markGroupMembership(groupId, nodeId, true)
        this.context.transaction.commit([groupMembershipEvent(groupId, [nodeId], [])])

        return true
    }

    removeGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.context.getGroup(groupId)
        const memberIndex = group.nodeIds.indexOf(nodeId)
        if (memberIndex < 0) return false

        group.nodeIds.splice(memberIndex, 1)
        this.context.setGroupNodeIds(groupId, Object.freeze([...group.nodeIds]))
        this.context.changeRegistry.markGroupMembership(groupId, nodeId, false)
        this.context.transaction.commit([groupMembershipEvent(groupId, [], [nodeId])])

        return true
    }

}
