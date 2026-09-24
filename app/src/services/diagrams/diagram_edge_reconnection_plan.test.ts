import { describe, expect, it } from 'vitest';
import type { DiagramEdge } from './diagram_data';
import { planEdgeReconnection } from './diagram_edge_reconnection_plan';

const edge: DiagramEdge = {
    id: 'connection', from: 'source', to: 'target', kind: 'connection',
    sourceAttachment: { nodeId: 'source', side: 'right', offset: 0.5 },
};

describe('planEdgeReconnection', () => {
    it('prepares a consistent edge and attachment without mutating the source', () => {
        const plan = planEdgeReconnection(edge, 'sourceAttachment', 'other');

        expect(plan?.candidate.from).toBe('other');
        expect(plan?.candidate.sourceAttachment?.nodeId).toBe('other');
        expect(edge.from).toBe('source');
        expect(edge.sourceAttachment?.nodeId).toBe('source');
    });

    it('returns no plan when the endpoint already uses the requested node', () => {
        expect(planEdgeReconnection(edge, 'sourceAttachment', 'source')).toBeNull();
    });
});
