import type { DiagramEdge } from './diagram_data';
import type { DiagramConnectionEndpoint } from './diagram_edit_types';

export interface DiagramEdgeReconnectionPlan {
    attachment: DiagramEdge[DiagramConnectionEndpoint];
    candidate: DiagramEdge;
    edgeField: 'from' | 'to';
    previousNodeId: string;
}

/** Builds the candidate edge so endpoint and attachment can be validated together. */
export function planEdgeReconnection(
    edge: DiagramEdge,
    endpoint: DiagramConnectionEndpoint,
    nodeId: string,
): DiagramEdgeReconnectionPlan | null {
    const edgeField = endpoint === 'sourceAttachment' ? 'from' : 'to';
    const previousNodeId = edge[edgeField];
    if (previousNodeId === nodeId) return null;

    const attachment = edge[endpoint];
    const candidate: DiagramEdge = {
        ...edge,
        [edgeField]: nodeId,
        ...(attachment ? { [endpoint]: { ...attachment, nodeId } } : {}),
    };

    return { attachment, candidate, edgeField, previousNodeId };
}
