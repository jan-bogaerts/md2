import { Profiler, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { EditableDiagramEdge } from './editable_diagram_edge'
import { EditableDiagramGroup } from './editable_diagram_group'
import { EditableDiagramNode } from './editable_diagram_node'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
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

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)

    return { geometry, selection: new DiagramSelectionService(session), session }
}

type RenderCounts = Map<string, number>

/** Counts commits inside one leaf subtree, so a leaf that is skipped by React is measured as skipped. */
function CountedLeaf({ children, counts, id }: { children: ReactNode, counts: RenderCounts, id: string }) {
    const handleRender = () => counts.set(id, (counts.get(id) ?? 0) + 1)

    return <Profiler id={id} onRender={handleRender}>{children}</Profiler>
}

function LeafTree({ counts, geometry, selection, session }: {
    counts: RenderCounts,
    geometry: DiagramGeometryService,
    selection: DiagramSelectionService,
    session: DiagramEditSessionService,
}) {
    return (
        <>
            <CountedLeaf counts={counts} id="orders">
                <EditableDiagramNode geometry={geometry} nodeId="orders" selection={selection} session={session} />
            </CountedLeaf>
            <CountedLeaf counts={counts} id="store">
                <EditableDiagramNode geometry={geometry} nodeId="store" selection={selection} session={session} />
            </CountedLeaf>
            <svg>
                <CountedLeaf counts={counts} id="edge">
                    <EditableDiagramEdge edgeId="orders-store" geometry={geometry} selection={selection} session={session} />
                </CountedLeaf>
            </svg>
            <CountedLeaf counts={counts} id="group">
                <EditableDiagramGroup geometry={geometry} groupId="backend" selection={selection} session={session} />
            </CountedLeaf>
        </>
    )
}

function renderTree() {
    const { geometry, selection, session } = createHarness()
    const counts: RenderCounts = new Map()
    render(<LeafTree counts={counts} geometry={geometry} selection={selection} session={session} />)

    return { counts, selection, session }
}

afterEach(cleanup)

describe('editable diagram leaves', () => {
    it('renders each leaf from its own service subscriptions', () => {
        renderTree()

        expect(screen.getByRole('button', { name: 'Orders' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Store' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'writes' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Backend' })).toBeTruthy()
    })

    it('rerenders only the edited node leaf when one node label changes', () => {
        const { counts, session } = renderTree()
        const before = new Map(counts)

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(counts.get('orders')).toBeGreaterThan(before.get('orders') ?? 0)
        expect(counts.get('store')).toBe(before.get('store'))
        expect(counts.get('edge')).toBe(before.get('edge'))
        expect(counts.get('group')).toBe(before.get('group'))
        expect(screen.getByRole('button', { name: 'Order intake' })).toBeTruthy()
    })

    it('rerenders the edge leaf for its own label and leaves the node leaves alone', () => {
        const { counts, session } = renderTree()
        const before = new Map(counts)

        act(() => { session.setEdgeField('orders-store', 'label', 'stores') })

        expect(counts.get('edge')).toBeGreaterThan(before.get('edge') ?? 0)
        expect(counts.get('orders')).toBe(before.get('orders'))
        expect(counts.get('store')).toBe(before.get('store'))
        expect(screen.getByRole('button', { name: 'stores' })).toBeTruthy()
    })

    it('rerenders the group leaf for its own label only', () => {
        const { counts, session } = renderTree()
        const before = new Map(counts)

        act(() => { session.setGroupField('backend', 'label', 'Services') })

        expect(counts.get('group')).toBeGreaterThan(before.get('group') ?? 0)
        expect(counts.get('orders')).toBe(before.get('orders'))
        expect(counts.get('edge')).toBe(before.get('edge'))
        expect(screen.getByRole('button', { name: 'Services' })).toBeTruthy()
    })

    it('rerenders only leaves whose selected boolean changes', () => {
        const { counts, selection } = renderTree()
        const before = new Map(counts)

        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })

        expect(counts.get('orders')).toBeGreaterThan(before.get('orders') ?? 0)
        expect(counts.get('store')).toBe(before.get('store'))
        expect(counts.get('edge')).toBe(before.get('edge'))
        expect(counts.get('group')).toBe(before.get('group'))
    })

    it('rerenders only the Ctrl-clicked leaf when additive membership changes', () => {
        const { counts } = renderTree()
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
        const beforeAdd = new Map(counts)

        fireEvent.click(screen.getByRole('button', { name: 'writes' }), { ctrlKey: true })
        const beforeRemove = new Map(counts)
        fireEvent.click(screen.getByRole('button', { name: 'writes' }), { ctrlKey: true })

        expect(beforeAdd.get('orders')).toBe(beforeRemove.get('orders'))
        expect(beforeAdd.get('store')).toBe(beforeRemove.get('store'))
        expect(beforeAdd.get('group')).toBe(beforeRemove.get('group'))
        expect(beforeRemove.get('edge')).toBeGreaterThan(beforeAdd.get('edge') ?? 0)
        expect(counts.get('orders')).toBe(beforeRemove.get('orders'))
        expect(counts.get('store')).toBe(beforeRemove.get('store'))
        expect(counts.get('group')).toBe(beforeRemove.get('group'))
        expect(counts.get('edge')).toBeGreaterThan(beforeRemove.get('edge') ?? 0)
    })
})
