import { describe, expect, it, vi } from 'vitest';
import type { DiagramEdge, DiagramGroup, DiagramNode } from './diagram_data';
import {
    generateDiagramChangeDescription,
    generateDiagramChangeDescriptions,
    type DiagramChangeDescriptionReader,
} from './diagram_change_descriptions';
import type { DiagramChange } from './diagram_edit_session_service';

interface ReaderData {
    changes?: readonly DiagramChange[];
    edges?: readonly DiagramEdge[];
    groups?: readonly DiagramGroup[];
    legend?: Readonly<Record<string, string>>;
    nodes?: readonly DiagramNode[];
    originalLegend?: Readonly<Record<string, string>>;
}

function diagramChange(overrides: Partial<DiagramChange> & Pick<DiagramChange, 'id' | 'objectId' | 'objectKind'>): DiagramChange {
    return {
        category: 'field',
        field: 'label',
        originalValue: 'old',
        ownerId: null,
        regionIndex: null,
        value: 'new',
        ...overrides,
    };
}

function reader(data: ReaderData = {}) {
    const changes = new Map((data.changes ?? []).map((change) => [change.id, change]));
    const edges = new Map((data.edges ?? []).map((edge) => [edge.id, edge]));
    const groups = new Map((data.groups ?? []).map((group) => [group.id, group]));
    const nodes = new Map((data.nodes ?? []).map((node) => [node.id, node]));
    const value = {
        getChange: vi.fn((changeId: string) => changes.get(changeId) ?? null),
        getChangeIdsSnapshot: vi.fn(() => [...changes.keys()]),
        getEdgeIdsSnapshot: vi.fn(() => [...edges.keys()]),
        getEdgeSnapshot: vi.fn((edgeId: string) => edges.get(edgeId) ?? null),
        getGroupIdsSnapshot: vi.fn(() => [...groups.keys()]),
        getGroupSnapshot: vi.fn((groupId: string) => groups.get(groupId) ?? null),
        getLegendEntryFieldSnapshot: vi.fn((entryKey: string) => data.legend?.[entryKey] ?? null),
        getNodeIdsSnapshot: vi.fn(() => [...nodes.keys()]),
        getNodeSnapshot: vi.fn((nodeId: string) => nodes.get(nodeId) ?? null),
        getOriginalLegendEntryFieldSnapshot: vi.fn((entryKey: string) => data.originalLegend?.[entryKey] ?? null),
    } as unknown as DiagramChangeDescriptionReader;

    return value;
}

const ordersNode: DiagramNode = { id: 'orders', label: 'Orders', role: 'focal' };
const storeNode: DiagramNode = { id: 'store', label: 'Store', role: 'store' };
const callsEdge: DiagramEdge = { from: 'orders', id: 'orders-store', kind: 'call', label: 'Loads', to: 'store' };
const backendGroup: DiagramGroup = { id: 'backend', label: 'Backend', nodeIds: ['orders'] };

describe('diagram change descriptions', () => {
    it('returns no implementation instructions for an empty change set', () => {
        const source = reader();

        expect(generateDiagramChangeDescriptions(source)).toBe('');
        expect(source.getChange).not.toHaveBeenCalled();
    });

    it('sorts output by stable change ID and reports latest net values', () => {
        const source = reader({
            changes: [
                diagramChange({ id: 'z-title', objectId: 'diagram', objectKind: 'meta', originalValue: 'Old', value: 'Final' }),
                diagramChange({ id: 'a-description', objectId: 'diagram', objectKind: 'meta', originalValue: 'Before', value: 'After' }),
            ],
        });

        const first = generateDiagramChangeDescriptions(source);
        const second = generateDiagramChangeDescriptions(source);

        expect(first).toBe([
            '- Change label of diagram metadata from "Before" to "After".',
            '- Change label of diagram metadata from "Old" to "Final".',
        ].join('\n'));
        expect(second).toBe(first);
    });

    it('describes node additions and removals with persisted semantic and geometry data', () => {
        const addedNode: DiagramNode = {
            drilldown: true,
            fields: [{ key: 'primary', name: 'id', type: 'uuid' }],
            height: 80,
            id: 'new-orders',
            kind: 'entity',
            label: 'Orders',
            role: 'focal',
            sublabel: 'API',
            tag: 'new',
            width: 160,
            x: 40,
            y: 80,
        };
        const removedNode: DiagramNode = { id: 'legacy', label: 'Legacy', role: 'backend' };
        const source = reader({
            changes: [
                diagramChange({
                    category: 'collection', field: null, id: 'node-add', objectId: addedNode.id,
                    objectKind: 'node', originalValue: null, value: addedNode,
                }),
                diagramChange({
                    category: 'collection', field: null, id: 'node-remove', objectId: removedNode.id,
                    objectKind: 'node', originalValue: removedNode, value: null,
                }),
            ],
            nodes: [addedNode],
        });

        expect(generateDiagramChangeDescription('node-add', source)).toContain(
            'Add node "Orders" with role "focal", kind "entity", sublabel "API", tag "new", drilldown true, '
            + 'diagram position (40, 80), diagram size 160 x 80, fields [{ name: "id", type "uuid", key "primary" }].',
        );
        expect(generateDiagramChangeDescription('node-remove', source)).toBe('Remove node "Legacy" with role "backend".');
    });

    it('describes edge additions and removals as relationships naming endpoints and kind', () => {
        const source = reader({
            changes: [
                diagramChange({
                    category: 'collection', field: null, id: 'edge-add', objectId: callsEdge.id,
                    objectKind: 'edge', originalValue: null, value: callsEdge,
                }),
                diagramChange({
                    category: 'collection', field: null, id: 'edge-remove', objectId: callsEdge.id,
                    objectKind: 'edge', originalValue: callsEdge, value: null,
                }),
            ],
            edges: [callsEdge],
            nodes: [ordersNode, storeNode],
        });

        expect(generateDiagramChangeDescription('edge-add', source)).toBe(
            'Add "call" connection labelled "Loads" from node "Orders" to node "Store".',
        );
        expect(generateDiagramChangeDescription('edge-remove', source)).toBe(
            'Remove "call" connection labelled "Loads" from node "Orders" to node "Store".',
        );
    });

    it('describes group and fragment additions and removals with membership', () => {
        const fragment = { id: 'retry', operator: 'opt' as const, regions: [{ edgeIds: [callsEdge.id], guard: 'Retry?' }] };
        const source = reader({
            changes: [
                diagramChange({
                    category: 'collection', field: null, id: 'group-add', objectId: backendGroup.id,
                    objectKind: 'group', originalValue: null, value: { ...backendGroup, height: 120, width: 200, x: 20, y: 40 },
                }),
                diagramChange({
                    category: 'collection', field: null, id: 'fragment-remove', objectId: fragment.id,
                    objectKind: 'fragment', originalValue: fragment, value: null,
                }),
            ],
            edges: [callsEdge],
            groups: [backendGroup],
            nodes: [ordersNode, storeNode],
        });

        expect(generateDiagramChangeDescription('group-add', source)).toBe(
            'Add group "Backend" with members [node "Orders"], x 20, y 40, width 200, height 120.',
        );
        expect(generateDiagramChangeDescription('fragment-remove', source)).toBe(
            'Remove fragment id "retry" with operator "opt" and regions '
            + '[{ guard: "Retry?", connections: ["call" connection labelled "Loads" from node "Orders" to node "Store"] }].',
        );
    });

    it('labels node and group moves and resizes as diagram geometry', () => {
        const changes = [
            diagramChange({ field: 'x', id: 'node-x', objectId: ordersNode.id, objectKind: 'node', originalValue: 20, value: 44 }),
            diagramChange({ field: 'height', id: 'node-height', objectId: ordersNode.id, objectKind: 'node', originalValue: 80, value: 120 }),
            diagramChange({ field: 'y', id: 'group-y', objectId: backendGroup.id, objectKind: 'group', originalValue: 40, value: 64 }),
            diagramChange({ field: 'width', id: 'group-width', objectId: backendGroup.id, objectKind: 'group', originalValue: 200, value: 240 }),
        ];
        const source = reader({ changes, groups: [backendGroup], nodes: [ordersNode] });

        expect(generateDiagramChangeDescription('node-x', source)).toBe(
            'Move node "Orders": change diagram x-coordinate from 20 to 44.',
        );
        expect(generateDiagramChangeDescription('node-height', source)).toBe(
            'Resize node "Orders": change diagram height from 80 to 120.',
        );
        expect(generateDiagramChangeDescription('group-y', source)).toContain('Move group "Backend"');
        expect(generateDiagramChangeDescription('group-width', source)).toContain('Resize group "Backend"');
    });

    it('describes detail, metadata, reconnect, order, and connection-point changes', () => {
        const reconnectedEdge: DiagramEdge = { ...callsEdge, from: 'client' };
        const clientNode: DiagramNode = { id: 'client', label: 'Client', role: 'external' };
        const changes = [
            diagramChange({ field: 'role', id: 'node-role', objectId: ordersNode.id, objectKind: 'node', originalValue: 'focal', value: 'backend' }),
            diagramChange({ field: 'title', id: 'meta-title', objectId: 'diagram', objectKind: 'meta', originalValue: 'Old', value: 'New' }),
            diagramChange({ field: 'from', id: 'edge-from', objectId: callsEdge.id, objectKind: 'edge', originalValue: 'orders', value: 'client' }),
            diagramChange({ field: 'row', id: 'edge-row', objectId: callsEdge.id, objectKind: 'edge', originalValue: 3, value: 1 }),
            diagramChange({
                field: 'side', id: 'attachment-side', objectId: `${callsEdge.id}:sourceAttachment`,
                objectKind: 'connectionPoint', originalValue: 'right', value: 'bottom',
            }),
        ];
        const source = reader({ changes, edges: [reconnectedEdge], nodes: [ordersNode, storeNode, clientNode] });

        expect(generateDiagramChangeDescription('node-role', source)).toBe(
            'Change role of node "Orders" from "focal" to "backend".',
        );
        expect(generateDiagramChangeDescription('meta-title', source)).toBe(
            'Change title of diagram metadata from "Old" to "New".',
        );
        expect(generateDiagramChangeDescription('edge-from', source)).toContain(
            'from "call" connection labelled "Loads" from node "Orders" to node "Store" '
            + 'to "call" connection labelled "Loads" from node "Client" to node "Store"',
        );
        expect(generateDiagramChangeDescription('edge-row', source)).toContain('from sequence row 3 to row 1');
        expect(generateDiagramChangeDescription('attachment-side', source)).toContain(
            'Change side of source attachment of "call" connection labelled "Loads" from node "Client" to node "Store" '
            + 'from "right" to "bottom".',
        );
    });

    it('adds stable IDs when duplicate labels make node and relationship references ambiguous', () => {
        const firstNode: DiagramNode = { id: 'first', label: 'Worker', role: 'backend' };
        const secondNode: DiagramNode = { id: 'second', label: 'Worker', role: 'backend' };
        const firstEdge: DiagramEdge = { from: 'first', id: 'edge-a', kind: 'connection', to: 'second' };
        const secondEdge: DiagramEdge = { from: 'first', id: 'edge-b', kind: 'connection', to: 'second' };
        const change = diagramChange({
            category: 'collection', field: null, id: 'edge-add', objectId: firstEdge.id,
            objectKind: 'edge', originalValue: null, value: firstEdge,
        });
        const source = reader({ changes: [change], edges: [firstEdge, secondEdge], nodes: [firstNode, secondNode] });

        expect(generateDiagramChangeDescription('edge-add', source)).toBe(
            'Add "connection" connection from node "Worker" (id "first") to node "Worker" (id "second") (edge id "edge-a").',
        );
    });

    it('describes group, fragment-region, and entity-field memberships', () => {
        const changes = [
            diagramChange({
                category: 'membership', field: 'nodeIds', id: 'group-member', objectId: ordersNode.id,
                objectKind: 'node', originalValue: false, ownerId: backendGroup.id, value: true,
            }),
            diagramChange({
                category: 'membership', field: 'edgeIds', id: 'fragment-member', objectId: callsEdge.id,
                objectKind: 'edge', originalValue: true, ownerId: 'retry', regionIndex: 1, value: false,
            }),
            diagramChange({
                category: 'membership', field: 'fields', id: 'entity-fields', objectId: ordersNode.id,
                objectKind: 'entityField', originalValue: [{ name: 'id' }], value: [{ name: 'id' }, { name: 'total', type: 'money' }],
            }),
        ];
        const source = reader({ changes, edges: [callsEdge], groups: [backendGroup], nodes: [ordersNode, storeNode] });

        expect(generateDiagramChangeDescription('group-member', source)).toBe(
            'Add node "Orders" to group "Backend".',
        );
        expect(generateDiagramChangeDescription('fragment-member', source)).toContain(
            'Remove "call" connection labelled "Loads" from node "Orders" to node "Store" from region index 1 of fragment id "retry".',
        );
        expect(generateDiagramChangeDescription('entity-fields', source)).toBe(
            'Replace fields of node "Orders" from [{ name: "id" }] to '
            + '[{ name: "id" }, { name: "total", type "money" }].',
        );
    });

    it('describes fragment details, entity-field details, and ordered region connections', () => {
        const secondEdge: DiagramEdge = { from: 'store', id: 'store-orders', kind: 'return', to: 'orders' };
        const changes = [
            diagramChange({ field: 'operator', id: 'fragment-operator', objectId: 'retry', objectKind: 'fragment', originalValue: 'opt', value: 'loop' }),
            diagramChange({
                field: 'guard', id: 'fragment-guard', objectId: 'retry', objectKind: 'fragment',
                originalValue: 'Old', ownerId: 'retry', regionIndex: 0, value: 'New',
            }),
            diagramChange({
                field: 'edgeIds', id: 'fragment-order', objectId: 'retry', objectKind: 'fragment',
                originalValue: [callsEdge.id, secondEdge.id], ownerId: 'retry', regionIndex: 0,
                value: [secondEdge.id, callsEdge.id],
            }),
            diagramChange({
                field: 'type', id: 'entity-field-type', objectId: `${ordersNode.id}[1]`,
                objectKind: 'entityField', originalValue: 'number', value: 'money',
            }),
        ];
        const source = reader({ changes, edges: [callsEdge, secondEdge], nodes: [ordersNode, storeNode] });

        expect(generateDiagramChangeDescription('fragment-operator', source)).toBe(
            'Change operator of fragment id "retry" from "opt" to "loop".',
        );
        expect(generateDiagramChangeDescription('fragment-guard', source)).toBe(
            'Change guard of fragment id "retry" region index 0 from "Old" to "New".',
        );
        expect(generateDiagramChangeDescription('fragment-order', source)).toContain(
            'Set ordered connections of fragment id "retry" region index 0',
        );
        expect(generateDiagramChangeDescription('entity-field-type', source)).toBe(
            'Change type of field at index 1 in node "Orders" from "number" to "money".',
        );
    });

    it('describes legend membership, labels, and ordering using original labels for removals', () => {
        const changes = [
            diagramChange({
                category: 'membership', field: 'legend', id: 'legend-add', objectId: 'node:external',
                objectKind: 'legendEntry', originalValue: false, ownerId: 'diagram', value: true,
            }),
            diagramChange({
                category: 'membership', field: 'legend', id: 'legend-remove', objectId: 'connection:call',
                objectKind: 'legendEntry', originalValue: true, ownerId: 'diagram', value: false,
            }),
            diagramChange({
                field: 'label', id: 'legend-label', objectId: 'node:focal', objectKind: 'legendEntry',
                originalValue: 'Service', value: 'Core service',
            }),
            diagramChange({
                field: 'order', id: 'legend-order', objectId: 'node:focal', objectKind: 'legendEntry',
                originalValue: 2, value: 0,
            }),
        ];
        const source = reader({
            changes,
            legend: { 'node:external': 'External', 'node:focal': 'Core service' },
            originalLegend: { 'connection:call': 'Calls' },
        });

        expect(generateDiagramChangeDescription('legend-add', source)).toBe(
            'Add legend entry "External" for node role "external".',
        );
        expect(generateDiagramChangeDescription('legend-remove', source)).toBe(
            'Remove legend entry "Calls" for connection kind "call".',
        );
        expect(generateDiagramChangeDescription('legend-label', source)).toBe(
            'Change label of legend entry "Core service" for node role "focal" from "Service" to "Core service".',
        );
        expect(generateDiagramChangeDescription('legend-order', source)).toBe(
            'Move legend entry "Core service" for node role "focal" from index 2 to index 0.',
        );
    });

    it('fails clearly when a requested change no longer exists', () => {
        expect(() => generateDiagramChangeDescription('missing', reader())).toThrow('Diagram change missing does not exist');
    });
});
