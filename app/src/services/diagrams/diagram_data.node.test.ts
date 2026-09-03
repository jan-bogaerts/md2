import { describe, expect, it } from 'vitest'
import { isDiagramDataPath, parseDiagramData, serializeDiagramData, type DiagramData } from './diagram_data'

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

    it('parses and serializes canonical edge connection points', () => {
        const diagram = validDiagram() as DiagramData
        diagram.edges[0] = {
            ...diagram.edges[0],
            sourceAttachment: { nodeId: 'api', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'store', offset: 0.75, side: 'left' },
        }

        const parsed = parseDiagramData(JSON.stringify(diagram))
        const serialized = serializeDiagramData(parsed)

        expect(parsed.edges[0]).toMatchObject({
            sourceAttachment: { nodeId: 'api', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'store', offset: 0.75, side: 'left' },
        })
        expect(serialized.endsWith('\n')).toBe(true)
        expect(parseDiagramData(serialized)).toEqual(parsed)
    })

    it('ignores legacy legend metadata', () => {
        const diagram = validDiagram()
        diagram.meta = { ...diagram.meta, legend: [{ label: 'Legacy label', role: 'focal' }] } as typeof diagram.meta

        expect(parseDiagramData(JSON.stringify(diagram)).meta).toEqual(validDiagram().meta)
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

    it('rejects invalid type semantics and geometry', () => {
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), nodes: [{ ...validDiagram().nodes[0], kind: 'decision' }, validDiagram().nodes[1]]}))).toThrow('unsupported value decision for architecture')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...validDiagram().edges[0], waypoints: [{ x: 0, y: 0 }] }]}))).toThrow('fewer than two points')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...validDiagram().edges[0], waypoints: [{ x: 0, y: 0 }, { x: 8, y: 8 }] }]}))).toThrow('diagonal segment')
    })

    it('rejects malformed connection points with precise fields', () => {
        const edge = validDiagram().edges[0]
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...edge, sourceAttachment: { nodeId: 'api', offset: 1.1, side: 'right' } }]}))).toThrow('edges[0].sourceAttachment.offset has number outside the 0..1 range')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...edge, targetAttachment: { nodeId: 'store', offset: 0.5, side: 'middle' } }]}))).toThrow('edges[0].targetAttachment.side has unsupported value middle')
        expect(() => parseDiagramData(JSON.stringify({...validDiagram(), edges: [{ ...edge, sourceAttachment: { nodeId: 'store', offset: 0.5, side: 'right' } }]}))).toThrow('edges.request.sourceAttachment.nodeId has node store does not match from api')
    })

    it('parses a large architecture document with many focal nodes and groups', () => {
        const nodes = Array.from({ length: 40 }, (_unused, index) => ({id: `node-${index}`, label: `Node ${index}`, role: index % 5 === 0 ? 'focal' : 'backend'}))
        const edges = Array.from({ length: 60 }, (_unused, index) => ({from: `node-${index % 40}`, id: `edge-${index}`, kind: 'connection', to: `node-${(index + 7) % 40}`}))
        const groups = Array.from({ length: 6 }, (_unused, index) => ({id: `group-${index}`, label: `Group ${index}`, nodeIds: [`node-${index * 2}`, `node-${index * 2 + 1}`]}))
        const parsed = parseDiagramData(JSON.stringify({ ...validDiagram(), edges, groups, nodes }))

        expect(parsed.nodes).toHaveLength(40)
        expect(parsed.edges).toHaveLength(60)
        expect(parsed.nodes.filter(({ role }) => role === 'focal').length).toBeGreaterThan(3)
        expect(parsed.groups.length).toBeGreaterThan(3)
    })

    it('parses three sequence fragments including an alt beside an opt', () => {
        const sequence = {
            edges: [
                { from: 'client', id: 'call', kind: 'call', to: 'server' },
                { from: 'server', id: 'ok', kind: 'success', to: 'client' },
                { from: 'server', id: 'fail', kind: 'return', to: 'client' },
                { from: 'client', id: 'retry', kind: 'call', to: 'server' },
            ],
            fragments: [
                { id: 'branch', operator: 'alt', regions: [{ edgeIds: ['ok'], guard: 'valid' }, { edgeIds: ['fail'], guard: 'invalid' }] },
                { id: 'optional', operator: 'opt', regions: [{ edgeIds: ['call'], guard: 'enabled' }] },
                { id: 'repeat', operator: 'loop', regions: [{ edgeIds: ['retry'], guard: 'until ok' }] },
            ],
            meta: { description: 'Request path', title: 'Request', type: 'sequence', version: 1 },
            nodes: [
                { id: 'client', label: 'Client', role: 'input' },
                { id: 'server', label: 'Server', role: 'backend' },
            ],
        }

        expect(parseDiagramData(JSON.stringify(sequence)).fragments).toHaveLength(3)
    })

    it('parses wide decisions, repeated cycles, and dense state transitions', () => {
        const flowchart = {
            edges: Array.from({ length: 4 }, (_unused, index) => ({from: 'choose', id: `branch-${index}`, kind: 'flow', label: `case ${index}`, to: `step-${index}`})),
            meta: { description: 'Wide decision', preset: 'flowchart', title: 'Choices', type: 'flow', version: 1 },
            nodes: [
                { id: 'choose', kind: 'decision', label: 'Choose', role: 'focal' },
                ...Array.from({ length: 4 }, (_unused, index) => ({ id: `step-${index}`, kind: 'step', label: `Step ${index}`, role: 'backend' })),
            ],
        }
        expect(parseDiagramData(JSON.stringify(flowchart)).edges).toHaveLength(4)

        const dependency = {
            edges: [
                { from: 'a', id: 'a-b', kind: 'cycle', to: 'b' },
                { from: 'b', id: 'b-a', kind: 'cycle', to: 'a' },
                { from: 'b', id: 'b-c', kind: 'cycle', to: 'c' },
            ],
            meta: { description: 'Cycles', title: 'Deps', type: 'dependency', version: 1 },
            nodes: ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase(), role: 'backend' })),
        }
        expect(parseDiagramData(JSON.stringify(dependency)).edges.filter(({ kind }) => kind === 'cycle')).toHaveLength(3)

        const state = {
            edges: Array.from({ length: 7 }, (_unused, index) => ({from: `state-${index % 3}`, id: `transition-${index}`, kind: 'transition', label: `t${index}`, to: `state-${(index + 1) % 3}`})),
            meta: { description: 'Dense states', preset: 'state', title: 'States', type: 'flow', version: 1 },
            nodes: Array.from({ length: 3 }, (_unused, index) => ({ id: `state-${index}`, kind: 'state', label: `State ${index}`, role: 'backend' })),
        }
        expect(parseDiagramData(JSON.stringify(state)).edges).toHaveLength(7)
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
