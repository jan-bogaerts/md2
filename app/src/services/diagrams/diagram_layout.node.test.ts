import { describe, expect, it } from 'vitest'
import type { DiagramData } from './diagram_data'
import { layout, sequenceMessageInsertionIndexAt, sequenceMessageRowY } from './diagram_layout'

function diagram(type: DiagramData['meta']['type'] = 'architecture'): DiagramData {
    return {
        edges: [
            { from: 'one', id: 'one-two', kind: type === 'sequence' ? 'call' : 'connection', to: 'two' },
            { from: 'one', id: 'one-three', kind: type === 'sequence' ? 'return' : 'connection', to: 'three' },
        ],
        groups: [{ id: 'system', label: 'System', nodeIds: ['one', 'two'] }],
        meta: { description: 'Layout test', title: 'Test', type, version: 1 },
        nodes: [
            { id: 'one', label: 'One', role: 'focal' },
            { id: 'two', label: 'Two', role: 'backend' },
            { height: 88, id: 'three', label: 'Three', role: 'store', width: 200, x: 400, y: 300 },
        ],
    }
}

type Positioned = ReturnType<typeof layout>

type PositionedNode = Positioned['nodes'][number]

function nodeById(positioned: Positioned, id: string) {
    return positioned.nodes.find((node) => node.id === id) as PositionedNode
}

function overlaps(left: PositionedNode, right: PositionedNode) {
    return left.x < right.x + right.width && right.x < left.x + left.width
        && left.y < right.y + right.height && right.y < left.y + left.height
}

/** Counts crossing pairs of a two-layer graph by comparing the horizontal order of each edge's endpoints. */
function layerCrossings(positioned: Positioned) {
    const centre = (id: string) => {
        const node = nodeById(positioned, id)

        return node.x + node.width / 2
    }

    return positioned.edges.reduce((total, left, index) => total + positioned.edges.slice(index + 1)
        .filter((right) => (centre(left.from) - centre(right.from)) * (centre(left.to) - centre(right.to)) < 0).length, 0)
}

describe('diagram layout', () => {
    it('places layered nodes on grid and routes orthogonal fanned edges', () => {
        const positioned = layout(diagram())
        const firstPoints = positioned.edges[0].points
        const secondPoints = positioned.edges[1].points

        expect(positioned.nodes.every(({ height, width, x, y }) => [height, width, x, y].every((value) => value % 4 === 0))).toBe(true)
        expect(firstPoints).toHaveLength(4)
        expect(firstPoints[0].x).not.toBe(secondPoints[0].x)
        expect(firstPoints[0].x).toBe(firstPoints[1].x)
        expect(firstPoints[1].y).toBe(firstPoints[2].y)
    })

    it('preserves supplied node geometry and waypoints in mixed data', () => {
        const automatic = layout(diagram())
        const one = nodeById(automatic, 'one')
        const two = nodeById(automatic, 'two')
        const lane = one.y + one.height + 24
        const data = diagram()
        data.edges[0].waypoints = [
            { x: one.x + one.width / 2, y: one.y + one.height },
            { x: one.x + one.width / 2, y: lane },
            { x: two.x + two.width / 2, y: lane },
            { x: two.x + two.width / 2, y: two.y },
        ]
        const positioned = layout(data)

        expect(nodeById(positioned, 'three')).toMatchObject({ height: 88, width: 200, x: 400, y: 300 })
        expect(positioned.edges[0].points).toEqual(data.edges[0].waypoints)
        expect(nodeById(positioned, 'two').x).toBeDefined()
    })

    it('keeps persisted group geometry and derives only the omitted group fields', () => {
        const data = diagram()
        data.groups[0] = { ...data.groups[0], height: 240, width: 360, x: 8, y: 12 }
        const persisted = layout(data)
        const derived = layout(diagram())

        expect(persisted.groups[0]).toMatchObject({ height: 240, width: 360, x: 8, y: 12 })
        expect(derived.groups[0].width).not.toBe(360)
        expect(derived.groups[0].height).toBeGreaterThan(0)
    })

    it('gives an empty group without persisted geometry a finite grid-aligned automatic box', () => {
        const data = diagram()
        data.groups[0].nodeIds = []

        const [group] = layout(data).groups

        expect(group).toMatchObject({ height: 56, width: 48, x: 40, y: 40 })
        expect([group.height, group.width, group.x, group.y].every((value) => Number.isFinite(value) && value % 4 === 0)).toBe(true)
    })

    it('leaves a persisted group box untouched when a member node moves', () => {
        const data = diagram()
        data.groups[0] = { ...data.groups[0], height: 240, width: 360, x: 8, y: 12 }
        const moved = diagram()
        moved.groups[0] = { ...moved.groups[0], height: 240, width: 360, x: 8, y: 12 }
        moved.nodes[1] = { ...moved.nodes[1], x: 800, y: 600 }

        expect(layout(moved).groups[0]).toMatchObject(layout(data).groups[0])
    })

    it('resolves connection points against moved and resized node boundaries', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { height: 80, id: 'one', label: 'One', role: 'focal', width: 160, x: 40, y: 80 },
            { height: 120, id: 'two', label: 'Two', role: 'backend', width: 200, x: 400, y: 120 },
        ]
        data.edges = [{
            from: 'one', id: 'attached', kind: 'connection',
            sourceAttachment: { nodeId: 'one', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'two', offset: 0.75, side: 'left' }, to: 'two',
        }]

        expect(layout(data).edges[0].points).toMatchObject([
            { x: 200, y: 100 }, {}, {}, { x: 400, y: 210 },
        ])

        data.nodes[0] = { ...data.nodes[0], height: 120, width: 200, x: 80, y: 120 }
        expect(layout(data).edges[0].points[0]).toEqual({ x: 280, y: 150 })
    })

    it('keeps distinct connection offsets on one node side', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { height: 80, id: 'one', label: 'One', role: 'focal', width: 160, x: 40, y: 80 },
            { height: 80, id: 'two', label: 'Two', role: 'backend', width: 160, x: 400, y: 40 },
            { height: 80, id: 'three', label: 'Three', role: 'backend', width: 160, x: 400, y: 200 },
        ]
        data.edges = [
            {
                from: 'one', id: 'upper', kind: 'connection',
                sourceAttachment: { nodeId: 'one', offset: 0.25, side: 'right' }, to: 'two',
            },
            {
                from: 'one', id: 'lower', kind: 'connection',
                sourceAttachment: { nodeId: 'one', offset: 0.75, side: 'right' }, to: 'three',
            },
        ]

        const positioned = layout(data)

        expect(positioned.edges[0].points[0]).toEqual({ x: 200, y: 100 })
        expect(positioned.edges[1].points[0]).toEqual({ x: 200, y: 140 })
    })

    it('regenerates stale waypoints from authoritative connection points', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { height: 80, id: 'one', label: 'One', role: 'focal', width: 160, x: 40, y: 80 },
            { height: 80, id: 'two', label: 'Two', role: 'backend', width: 160, x: 400, y: 80 },
        ]
        data.edges = [{
            from: 'one', id: 'attached', kind: 'connection',
            sourceAttachment: { nodeId: 'one', offset: 0.5, side: 'right' },
            to: 'two', waypoints: [{ x: 160, y: 120 }, { x: 400, y: 120 }],
        }]

        expect(layout(data).edges[0].points[0]).toEqual({ x: 200, y: 120 })
    })

    it('places sequence participants in columns and messages in deterministic rows', () => {
        const positioned = layout(diagram('sequence'))

        expect(positioned.nodes[0].y).toBe(positioned.nodes[1].y)
        expect(positioned.edges[0].points[0].y).toBeLessThan(positioned.edges[1].points[0].y)
        expect(positioned.edges[0].points[0].y % 4).toBe(0)
    })

    it('maps diagram Y positions to bounded sequence insertion rows', () => {
        expect(sequenceMessageInsertionIndexAt(sequenceMessageRowY(0), 2)).toBe(0)
        expect(sequenceMessageInsertionIndexAt(sequenceMessageRowY(1), 2)).toBe(1)
        expect(sequenceMessageInsertionIndexAt(sequenceMessageRowY(4), 2)).toBe(2)
        expect(sequenceMessageInsertionIndexAt(0, 2)).toBe(0)
    })

    it('uses explicit connection points for sequence edges', () => {
        const data = diagram('sequence')
        data.edges = [{
            from: 'one', id: 'message', kind: 'call',
            sourceAttachment: { nodeId: 'one', offset: 0.25, side: 'bottom' },
            targetAttachment: { nodeId: 'two', offset: 0.75, side: 'bottom' }, to: 'two',
        }]

        const positioned = layout(data)
        const source = positioned.nodes.find(({ id }) => id === 'one') as NonNullable<typeof positioned.nodes[number]>
        const target = positioned.nodes.find(({ id }) => id === 'two') as NonNullable<typeof positioned.nodes[number]>

        expect(positioned.edges[0].points[0]).toEqual({ x: source.x + source.width * 0.25, y: source.y + source.height })
        expect(positioned.edges[0].points.at(-1)).toEqual({ x: target.x + target.width * 0.75, y: target.y + target.height })
    })

    it('adds a hop to the later connector when generated routes cross', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { id: 'one', label: 'One', role: 'focal', x: 0, y: 100 },
            { id: 'two', label: 'Two', role: 'backend', x: 400, y: 100 },
            { id: 'three', label: 'Three', role: 'backend', x: 240, y: 0 },
            { id: 'four', label: 'Four', role: 'backend', x: 240, y: 300 },
        ]
        data.edges = [
            { from: 'one', id: 'horizontal', kind: 'connection', to: 'two' },
            { from: 'three', id: 'vertical', kind: 'connection', to: 'four' },
        ]

        expect(layout(data).edges[1].points.length).toBeGreaterThan(4)
    })

    it('places a cyclic graph at finite, non-overlapping, in-bounds positions', () => {
        const data = diagram()
        data.groups = []
        data.nodes = data.nodes.slice(0, 2)
        data.edges = [
            { from: 'one', id: 'forward', kind: 'connection', to: 'two' },
            { from: 'two', id: 'back', kind: 'connection', to: 'one' },
        ]

        const positioned = layout(data)
        const [first, second] = positioned.nodes

        expect(positioned.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0)).toBe(true)
        expect(overlaps(first, second)).toBe(false)
        expect(positioned.nodes.every((node) => node.x + node.width <= positioned.width
            && node.y + node.height <= positioned.height)).toBe(true)
    })

    it('routes around a non-endpoint node', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { id: 'one', label: 'One', role: 'focal', x: 0, y: 80 },
            { id: 'obstacle', label: 'Obstacle', role: 'backend', x: 240, y: 80 },
            { id: 'two', label: 'Two', role: 'backend', x: 480, y: 80 },
        ]
        data.edges = [{ from: 'one', id: 'around', kind: 'connection', to: 'two' }]

        const points = layout(data).edges[0].points

        expect(points.some(({ y }) => y < 80 || y > 152)).toBe(true)
    })

    it('positions sequence fragments and nested activation intervals', () => {
        const data = diagram('sequence')
        data.groups = []
        data.nodes = data.nodes.slice(0, 3)
        data.edges = [
            { from: 'one', id: 'outer-call', kind: 'call', to: 'two' },
            { from: 'three', id: 'inner-call', kind: 'call', to: 'two' },
            { from: 'two', id: 'inner-return', kind: 'return', to: 'three' },
            { from: 'two', id: 'outer-return', kind: 'return', to: 'one' },
        ]
        data.fragments = [{ id: 'loop', operator: 'loop', regions: [{ edgeIds: ['inner-call', 'inner-return'], guard: 'retry' }] }]

        const positioned = layout(data)

        expect(positioned.activations).toHaveLength(2)
        expect(positioned.activations[0].height).toBeGreaterThan(positioned.activations[1].height)
        expect(positioned.fragments[0]).toMatchObject({ id: 'loop', operator: 'loop' })
    })

    it('routes every edge of a dense graph even when clean lanes run out', () => {
        const data = diagram()
        data.groups = []
        data.nodes = Array.from({ length: 12 }, (_unused, index) => ({
            id: `node-${index}`, label: `Node ${index}`, role: 'backend' as const,
            x: (index % 4) * 160, y: Math.floor(index / 4) * 72,
        }))
        data.edges = Array.from({ length: 24 }, (_unused, index) => ({from: `node-${index % 12}`, id: `edge-${index}`, kind: 'connection' as const, to: `node-${(index + 5) % 12}`}))

        const positioned = layout(data)

        const obstructed = positioned.edges.some((edge) => edge.points.slice(1).some((end, index) => {
            const start = edge.points[index]

            return positioned.nodes.filter(({ id }) => id !== edge.from && id !== edge.to).some((node) => {
                const insideRow = start.y === end.y && start.y > node.y && start.y < node.y + node.height
                    && Math.max(start.x, end.x) > node.x && Math.min(start.x, end.x) < node.x + node.width
                const insideColumn = start.x === end.x && start.x > node.x && start.x < node.x + node.width
                    && Math.max(start.y, end.y) > node.y && Math.min(start.y, end.y) < node.y + node.height

                return insideRow || insideColumn
            })
        }))

        expect(positioned.edges.map(({ id }) => id)).toEqual(data.edges.map(({ id }) => id))
        expect(positioned.edges.every(({ points }) => points.length >= 2)).toBe(true)
        expect(obstructed).toBe(true)
    })

    it('clamps connector ports on a node too narrow to keep them apart', () => {
        const data: DiagramData = {
            edges: Array.from({ length: 6 }, (_unused, index) => ({from: `state-${index}`, id: `transition-${index}`, kind: 'transition', label: `t${index}`, to: 'done'})),
            groups: [],
            meta: { description: 'Narrow terminator', preset: 'state', title: 'States', type: 'flow', version: 1 },
            nodes: [
                ...Array.from({ length: 6 }, (_unused, index) => ({id: `state-${index}`, kind: 'state' as const, label: `State ${index}`, role: 'backend' as const})),
                { id: 'done', kind: 'end', label: 'Done', role: 'backend' },
            ],
        }

        const positioned = layout(data)
        const terminator = positioned.nodes.find(({ id }) => id === 'done')

        expect(terminator).toMatchObject({ height: 24, width: 24 })
        expect(positioned.edges).toHaveLength(6)
    })

    it('lays out a dependency graph deeper than four ranks', () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f']
        const data: DiagramData = {
            edges: ids.slice(1).map((id, index) => ({ from: ids[index], id: `${ids[index]}-${id}`, kind: 'dependency', to: id })),
            groups: [],
            meta: { description: 'Deep chain', title: 'Deps', type: 'dependency', version: 1 },
            nodes: ids.map((id) => ({ id, label: id.toUpperCase(), role: 'backend' as const })),
        }

        const positioned = layout(data)

        expect(new Set(positioned.nodes.map(({ y }) => y)).size).toBe(6)
    })

    it('produces identical positioned nodes for identical input', () => {
        expect(layout(diagram()).nodes).toEqual(layout(diagram()).nodes)
    })

    it('separates ranks top to bottom by the configured rank gap', () => {
        const ids = ['a', 'b', 'c']
        const data: DiagramData = {
            edges: ids.slice(1).map((id, index) => ({ from: ids[index], id: `${ids[index]}-${id}`, kind: 'dependency', to: id })),
            groups: [],
            meta: { description: 'Chain', title: 'Deps', type: 'dependency', version: 1 },
            nodes: ids.map((id) => ({ id, label: id.toUpperCase(), role: 'backend' as const })),
        }

        const positioned = layout(data)
        const [first, second, third] = ids.map((id) => nodeById(positioned, id))

        expect(second.y - (first.y + first.height)).toBe(96)
        expect(third.y - (second.y + second.height)).toBe(96)
        expect(positioned.nodes.every(({ x, y }) => x % 4 === 0 && y % 4 === 0)).toBe(true)
    })

    it('reorders both layers so a graph the old one-pass ordering crossed stays crossing free', () => {
        const data: DiagramData = {
            edges: [
                { from: 'a', id: 'a-p', kind: 'dependency', to: 'p' },
                { from: 'b', id: 'b-q', kind: 'dependency', to: 'q' },
                { from: 'c', id: 'c-p', kind: 'dependency', to: 'p' },
                { from: 'd', id: 'd-q', kind: 'dependency', to: 'q' },
            ],
            groups: [],
            meta: { description: 'Interleaved parents', title: 'Deps', type: 'dependency', version: 1 },
            nodes: ['a', 'b', 'c', 'd', 'p', 'q'].map((id) => ({ id, label: id.toUpperCase(), role: 'backend' as const })),
        }

        expect(layerCrossings(layout(data))).toBe(0)
    })

    it('places disconnected subgraphs and isolated nodes without overlap', () => {
        const data: DiagramData = {
            edges: [
                { from: 'a', id: 'a-b', kind: 'dependency', to: 'b' },
                { from: 'c', id: 'c-d', kind: 'dependency', to: 'd' },
            ],
            groups: [],
            meta: { description: 'Disconnected', title: 'Deps', type: 'dependency', version: 1 },
            nodes: ['a', 'b', 'c', 'd', 'lonely'].map((id) => ({ id, label: id.toUpperCase(), role: 'backend' as const })),
        }

        const positioned = layout(data)
        const collisions = positioned.nodes.some((left, index) => positioned.nodes.slice(index + 1).some((right) => overlaps(left, right)))

        expect(positioned.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
        expect(collisions).toBe(false)
    })

    it('produces valid surface bounds for empty and single-node diagrams', () => {
        const empty: DiagramData = {
            edges: [], groups: [],
            meta: { description: 'Empty', title: 'Empty', type: 'architecture', version: 1 }, nodes: [],
        }
        const single: DiagramData = { ...empty, nodes: [{ id: 'only', label: 'Only', role: 'focal' }] }

        const emptyPositioned = layout(empty)
        const singlePositioned = layout(single)

        expect(emptyPositioned.nodes).toHaveLength(0)
        expect(emptyPositioned.width).toBeGreaterThan(0)
        expect(emptyPositioned.height).toBeGreaterThan(0)
        expect(nodeById(singlePositioned, 'only')).toMatchObject({ x: 40, y: 40 })
        expect(singlePositioned.width).toBeGreaterThanOrEqual(240)
    })

    it('keeps each supplied axis while filling the missing one', () => {
        const data = diagram()
        data.groups = []
        data.nodes = [
            { id: 'one', label: 'One', role: 'focal' },
            { id: 'two', label: 'Two', role: 'backend', x: 640 },
            { id: 'three', label: 'Three', role: 'store', y: 720 },
        ]

        const positioned = layout(data)
        const two = nodeById(positioned, 'two')
        const three = nodeById(positioned, 'three')

        expect(two.x).toBe(640)
        expect(two.y).not.toBe(nodeById(positioned, 'one').y)
        expect(three.y).toBe(720)
        expect(Number.isFinite(three.x)).toBe(true)
    })

    it('ignores cycle edges and self edges when ranking nodes', () => {
        const plain = diagram()
        plain.groups = []
        const decorated = diagram()
        decorated.groups = []
        decorated.edges = [
            ...plain.edges,
            { from: 'two', id: 'two-one-cycle', kind: 'cycle', to: 'one' },
            { from: 'two', id: 'two-self', kind: 'connection', to: 'two' },
        ]

        const geometry = (positioned: Positioned) => positioned.nodes.map(({ height, id, width, x, y }) => ({ height, id, width, x, y }))

        expect(geometry(layout(decorated))).toEqual(geometry(layout(plain)))
    })

    it('lays out a hundred nodes and a hundred and fifty edges quickly', () => {
        const data = diagram()
        data.groups = []
        data.nodes = Array.from({ length: 100 }, (_unused, index) => ({id: `node-${index}`, label: `Node ${index}`, role: 'backend' as const}))
        data.edges = Array.from({ length: 150 }, (_unused, index) => ({from: `node-${index % 100}`, id: `edge-${index}`, kind: 'connection' as const, to: `node-${(index * 7 + 3) % 100}`}))

        const started = Date.now()
        const positioned = layout(data)

        expect(positioned.edges).toHaveLength(150)
        expect(Date.now() - started).toBeLessThan(1000)
    })
})
