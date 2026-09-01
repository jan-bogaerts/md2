import { describe, expect, it } from 'vitest'
import { isDiagramDataPath, parseDiagramData, type DiagramData } from './diagram_data'

function validDiagram() {
    return {
        edges: [{ from: 'api', id: 'request', kind: 'connection', label: 'HTTPS', to: 'store' }],
        groups: [{ id: 'backend', label: 'Backend', nodeIds: ['api', 'store'] }],
        meta: { description: 'Request path', title: 'System', type: 'architecture', version: 1 },
        nodes: [
            { id: 'api', label: 'API', role: 'focal' },
            { height: 64, id: 'store', label: 'Store', role: 'store', width: 120, x: 240, y: 80 },
        ],
    }
}

describe('parseDiagramData', () => {
    it('parses versioned semantic data and optional geometry', () => {
        expect(parseDiagramData(JSON.stringify(validDiagram()))).toEqual(validDiagram())
    })

    it('requires flow preset and accepts entity fields and cardinality', () => {
        const flow = {
            ...validDiagram(),
            edges: [{ from: 'api', id: 'request', kind: 'transition', label: 'connect', to: 'store' }],
            meta: { ...validDiagram().meta, preset: 'state', type: 'flow' },
            nodes: validDiagram().nodes.map((node) => ({ ...node, kind: 'state' })),
        }
        expect(parseDiagramData(JSON.stringify(flow)).meta.preset).toBe('state')

        const entity = {
            edges: [{ from: 'order', fromCardinality: '1', id: 'owns', kind: 'relationship', to: 'line', toCardinality: '1..*' }],
            meta: { description: 'Order model', title: 'Orders', type: 'entity', version: 1 },
            nodes: [
                { fields: [{ key: 'primary', name: 'id', type: 'UUID' }], id: 'order', label: 'Order', role: 'focal' },
                { fields: [{ key: 'foreign', name: 'orderId' }], id: 'line', label: 'Line', role: 'backend' },
            ],
        }
        expect(parseDiagramData(JSON.stringify(entity)).nodes[0].fields?.[0].key).toBe('primary')
    })

    it('rejects malformed values and references with precise fields', () => {
        expect(() => parseDiagramData('{')).toThrow('Malformed diagram data: invalid JSON')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), meta: { ...validDiagram().meta, version: 2 } })))
            .toThrow('meta.version has unsupported value 2')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), nodes: [...validDiagram().nodes, validDiagram().nodes[0]] })))
            .toThrow('nodes has duplicate id api')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), edges: [{ ...validDiagram().edges[0], to: 'missing' }] })))
            .toThrow('edges.request.to has unknown node missing')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), nodes: [{ ...validDiagram().nodes[0], width: 0 }] })))
            .toThrow('nodes[0].width has invalid number')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), edges: [{ ...validDiagram().edges[0], id: 'api' }] })))
            .toThrow('nodes and edges has duplicate id api')
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), edges: [], groups: [], nodes: [] })))
            .toThrow('nodes has empty array')
    })

    it('rejects type-specific fields outside their diagram type', () => {
        const diagram = validDiagram() as unknown as DiagramData
        diagram.nodes[0] = { ...diagram.nodes[0], fields: [{ name: 'id' }] }

        expect(() => parseDiagramData(JSON.stringify(diagram))).toThrow('nodes.fields has value only allowed for entity diagrams')
    })

    it('rejects invalid type semantics, geometry, and complexity', () => {
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), nodes: [{ ...validDiagram().nodes[0], kind: 'decision' }, validDiagram().nodes[1]]}))).toThrow('unsupported value decision for architecture')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...validDiagram().edges[0], waypoints: [{ x: 0, y: 0 }] }]}))).toThrow('fewer than two points')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...validDiagram().edges[0], waypoints: [{ x: 0, y: 0 }, { x: 8, y: 8 }] }]}))).toThrow('diagonal segment')
        const nodes = Array.from({ length: 10 }, (_unused, index) => ({ id: `node-${index}`, label: `Node ${index}`, role: 'backend' }))
        expect(() => parseDiagramData(JSON.stringify({ ...validDiagram(), edges: [], groups: [], nodes })))
            .toThrow('nodes has more than 9 items')
    })

    it('parses bounded sequence fragments', () => {
        const sequence = {
            edges: [{ from: 'client', id: 'call', kind: 'call', to: 'server' }],
            fragments: [{ id: 'optional-call', operator: 'opt', regions: [{ edgeIds: ['call'], guard: 'enabled' }] }],
            meta: { description: 'Optional request', title: 'Request', type: 'sequence', version: 1 },
            nodes: [
                { id: 'client', label: 'Client', role: 'input' },
                { id: 'server', label: 'Server', role: 'backend' },
            ],
        }

        expect(parseDiagramData(JSON.stringify(sequence)).fragments?.[0].operator).toBe('opt')
    })

    it('recognizes JSON diagram paths without accepting SVG', () => {
        expect(isDiagramDataPath('design/diagrams/overview.JSON')).toBe(true)
        expect(isDiagramDataPath('design/diagrams/overview.svg')).toBe(false)
    })
})
