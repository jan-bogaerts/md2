import { describe, expect, it } from 'vitest'
import type { DiagramData } from './diagram_data'
import { layout } from './diagram_layout'

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
        const data = diagram()
        data.edges[0].waypoints = [{ x: 120, y: 112 }, { x: 120, y: 208 }]
        const positioned = layout(data)

        expect(positioned.nodes.find(({ id }) => id === 'three')).toMatchObject({ height: 88, width: 200, x: 400, y: 300 })
        expect(positioned.edges[0].points).toEqual(data.edges[0].waypoints)
        expect(positioned.nodes.find(({ id }) => id === 'two')?.x).toBeDefined()
    })

    it('places sequence participants in columns and messages in deterministic rows', () => {
        const positioned = layout(diagram('sequence'))

        expect(positioned.nodes[0].y).toBe(positioned.nodes[1].y)
        expect(positioned.edges[0].points[0].y).toBeLessThan(positioned.edges[1].points[0].y)
        expect(positioned.edges[0].points[0].y % 4).toBe(0)
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

    it('keeps cyclic graph nodes in a bounded rank', () => {
        const data = diagram()
        data.groups = []
        data.nodes = data.nodes.slice(0, 2)
        data.edges = [
            { from: 'one', id: 'forward', kind: 'connection', to: 'two' },
            { from: 'two', id: 'back', kind: 'connection', to: 'one' },
        ]

        const positioned = layout(data)

        expect(positioned.nodes[0].y).toBe(positioned.nodes[1].y)
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
})
