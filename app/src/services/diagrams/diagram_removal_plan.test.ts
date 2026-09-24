import { describe, expect, it } from 'vitest';
import type { DiagramData } from './diagram_data';
import { planDiagramRemoval } from './diagram_removal_plan';

const diagram: DiagramData = {
    nodes: [
        { id: 'source', label: 'Source', role: 'focal' },
        { id: 'target', label: 'Target', role: 'store' },
    ],
    edges: [{ id: 'connection', from: 'source', to: 'target', kind: 'connection' }],
    groups: [{ id: 'group', label: 'Group', nodeIds: ['source'] }],
    meta: { title: 'Diagram', description: '', type: 'architecture', version: 1 },
};

describe('planDiagramRemoval', () => {
    it('includes edges attached to removed nodes without mutating the diagram', () => {
        const plan = planDiagramRemoval(diagram, [{ objectId: 'source', objectKind: 'node' }]);

        expect(plan?.removedNodeIds).toEqual(['source']);
        expect(plan?.removedEdgeIds).toEqual(['connection']);
        expect(diagram.nodes).toHaveLength(2);
        expect(diagram.edges).toHaveLength(1);
    });

    it('rejects deleting every node from a non-mindmap diagram', () => {
        expect(() => planDiagramRemoval(diagram, [
            { objectId: 'source', objectKind: 'node' },
            { objectId: 'target', objectKind: 'node' },
        ])).toThrow();
    });
});
