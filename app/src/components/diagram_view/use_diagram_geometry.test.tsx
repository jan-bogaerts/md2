import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { useEditableDiagramNodeIds } from './use_editable_diagram'
import {
    useDiagramEdgeRoute,
    useDiagramGroupGeometryField,
    useDiagramNodeGeometryField,
    useDiagramSurfaceField,
} from './use_diagram_geometry'

const diagram: DiagramData = {
    edges: [
        { from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' },
        { from: 'orders', id: 'orders-mail', kind: 'connection', to: 'mail' },
    ],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { height: 64, id: 'store', label: 'Store', role: 'store', width: 120, x: 240, y: 320 },
        { id: 'mail', label: 'Mail', role: 'external' },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

type RenderCounter = ReturnType<typeof vi.fn<(...values: unknown[]) => void>>

interface RenderCounters {
    collection: RenderCounter
    comparison: RenderCounter
    edge: RenderCounter
    group: RenderCounter
    movedNode: RenderCounter
    root: RenderCounter
    unrelatedNode: RenderCounter
}

interface GeometryTreeProps {
    counters: RenderCounters
    geometry: DiagramGeometryService
    session: DiagramEditSessionService
}

function NodeGeometryLeaf({ counters, geometry, nodeId }: GeometryTreeProps & { nodeId: string }) {
    const x = useDiagramNodeGeometryField(nodeId, 'x', geometry)
    const counter = nodeId === 'mail' ? counters.movedNode : counters.unrelatedNode
    counter(x)

    return null
}

function EdgeRouteLeaf({ counters, edgeId, geometry }: GeometryTreeProps & { edgeId: string }) {
    counters.edge(useDiagramEdgeRoute(edgeId, geometry))

    return null
}

function GroupGeometryLeaf({ counters, geometry }: GeometryTreeProps) {
    counters.group(useDiagramGroupGeometryField('backend', 'x', geometry))

    return null
}

function NodeCollection({ counters, geometry, session }: GeometryTreeProps) {
    const nodeIds = useEditableDiagramNodeIds(session)
    counters.collection(nodeIds)

    return nodeIds.map((nodeId) => (
        <NodeGeometryLeaf counters={counters} geometry={geometry} key={nodeId} nodeId={nodeId} session={session} />
    ))
}

function ComparisonPane({ counters, geometry, session }: GeometryTreeProps) {
    counters.comparison()

    return <NodeCollection counters={counters} geometry={geometry} session={session} />
}

function DiagramRoot({ counters, geometry, session }: GeometryTreeProps) {
    counters.root(useDiagramSurfaceField('width', geometry))

    return (
        <>
            <NodeCollection counters={counters} geometry={geometry} session={session} />
            <EdgeRouteLeaf counters={counters} edgeId="orders-mail" geometry={geometry} session={session} />
            <GroupGeometryLeaf counters={counters} geometry={geometry} session={session} />
        </>
    )
}

function createCounters(): RenderCounters {
    return {
        collection: vi.fn(),
        comparison: vi.fn(),
        edge: vi.fn(),
        group: vi.fn(),
        movedNode: vi.fn(),
        root: vi.fn(),
        unrelatedNode: vi.fn(),
    }
}

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    // The surface is widened once up front, so the measured move stays inside the bounds and cannot wake the root.
    session.setNodeField('store', 'x', 1200)

    return { geometry, session }
}

afterEach(cleanup)

describe('diagram geometry subscriptions', () => {
    it('rerenders only the leaves whose derived geometry changed', () => {
        const { geometry, session } = createHarness()
        const counters = createCounters()
        render(<DiagramRoot counters={counters} geometry={geometry} session={session} />)
        const rootRenders = counters.root.mock.calls.length
        const collectionRenders = counters.collection.mock.calls.length
        const unrelatedRenders = counters.unrelatedNode.mock.calls.length
        const movedRenders = counters.movedNode.mock.calls.length
        const edgeRenders = counters.edge.mock.calls.length
        const groupRenders = counters.group.mock.calls.length

        act(() => session.setNodeField('mail', 'x', 120))

        expect(counters.movedNode.mock.calls.length).toBeGreaterThan(movedRenders)
        expect(counters.edge.mock.calls.length).toBeGreaterThan(edgeRenders)
        expect(counters.root).toHaveBeenCalledTimes(rootRenders)
        expect(counters.collection).toHaveBeenCalledTimes(collectionRenders)
        expect(counters.unrelatedNode).toHaveBeenCalledTimes(unrelatedRenders)
        expect(counters.group).toHaveBeenCalledTimes(groupRenders)
    })

    it('leaves a comparison pane untouched when derived geometry changes in the other tree', () => {
        const { geometry, session } = createHarness()
        const counters = createCounters()
        const comparisonCounters = createCounters()
        render(
            <>
                <DiagramRoot counters={counters} geometry={geometry} session={session} />
                <ComparisonPane counters={comparisonCounters} geometry={geometry} session={session} />
            </>,
        )
        const comparisonRenders = comparisonCounters.comparison.mock.calls.length
        const comparisonCollectionRenders = comparisonCounters.collection.mock.calls.length

        act(() => session.setNodeField('mail', 'x', 120))

        expect(comparisonCounters.comparison).toHaveBeenCalledTimes(comparisonRenders)
        expect(comparisonCounters.collection).toHaveBeenCalledTimes(comparisonCollectionRenders)
    })

    it('rerenders no geometry leaf for a non-geometric field update', () => {
        const { geometry, session } = createHarness()
        const counters = createCounters()
        render(<DiagramRoot counters={counters} geometry={geometry} session={session} />)
        const movedRenders = counters.movedNode.mock.calls.length
        const edgeRenders = counters.edge.mock.calls.length
        const rootRenders = counters.root.mock.calls.length

        act(() => session.setNodeField('mail', 'label', 'Mailer'))

        expect(counters.movedNode).toHaveBeenCalledTimes(movedRenders)
        expect(counters.edge).toHaveBeenCalledTimes(edgeRenders)
        expect(counters.root).toHaveBeenCalledTimes(rootRenders)
    })

    it('rerenders the surface leaf only when a surface bound changes', () => {
        const { geometry, session } = createHarness()
        const counters = createCounters()
        render(<DiagramRoot counters={counters} geometry={geometry} session={session} />)
        const rootRenders = counters.root.mock.calls.length

        act(() => session.setNodeField('store', 'x', 2000))

        expect(counters.root.mock.calls.length).toBeGreaterThan(rootRenders)
        expect(counters.root.mock.lastCall?.[0]).toBe(geometry.getSurfaceFieldSnapshot('width'))
    })
})
