import type { DiagramData } from './diagram_data';
import type { DiagramRemovalIdentity } from './diagram_edit_types';
import { invalidDiagramField } from './diagram_edit_validation';

export interface DiagramRemovalPlan {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    groupIds: Set<string>;
    removedNodeIds: string[];
    removedEdgeIds: string[];
    removedGroupIds: string[];
    emptiedRegionPaths: string[];
}

/** Resolves selected objects, dependent edges, and references affected by deletion. */
export function planDiagramRemoval(diagram: DiagramData, identities: readonly DiagramRemovalIdentity[]): DiagramRemovalPlan | null {
    const existingNodeIds = new Set(diagram.nodes.map(({ id }) => id));
    const existingEdgeIds = new Set(diagram.edges.map(({ id }) => id));
    const existingGroupIds = new Set(diagram.groups.map(({ id }) => id));
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const { objectId, objectKind } of identities) {
        if (objectKind === 'node' && existingNodeIds.has(objectId)) nodeIds.add(objectId);
        if (objectKind === 'edge' && existingEdgeIds.has(objectId)) edgeIds.add(objectId);
        if (objectKind === 'group' && existingGroupIds.has(objectId)) groupIds.add(objectId);
    }
    if (nodeIds.size === 0 && edgeIds.size === 0 && groupIds.size === 0) return null;

    if (diagram.meta.type !== 'mindmap' && nodeIds.size === diagram.nodes.length) {
        invalidDiagramField('nodes', 'empty array after deleting selection');
    }
    const removesRoot = diagram.nodes.some(({ id, kind }) => kind === 'root' && nodeIds.has(id));
    const leavesTopic = diagram.nodes.some(({ id, kind }) => kind === 'topic' && !nodeIds.has(id));
    if (diagram.meta.type === 'mindmap' && removesRoot && leavesTopic) {
        invalidDiagramField('nodes', 'cannot remove mindmap root while topics remain');
    }

    for (const edge of diagram.edges) {
        if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) edgeIds.add(edge.id);
    }
    const emptiedRegionPaths = (diagram.fragments ?? []).flatMap((fragment) => (
        fragment.regions.flatMap((region, regionIndex) => (
            region.edgeIds.length > 0 && region.edgeIds.every((edgeId) => edgeIds.has(edgeId))
                ? [`fragments.${fragment.id}.regions[${regionIndex}].edgeIds`]
                : []
        ))
    ));

    return {
        nodeIds,
        edgeIds,
        groupIds,
        removedNodeIds: diagram.nodes.filter(({ id }) => nodeIds.has(id)).map(({ id }) => id),
        removedEdgeIds: diagram.edges.filter(({ id }) => edgeIds.has(id)).map(({ id }) => id),
        removedGroupIds: diagram.groups.filter(({ id }) => groupIds.has(id)).map(({ id }) => id),
        emptiedRegionPaths,
    };
}
