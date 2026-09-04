import { Profiler, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { EditableDiagram, EditableDiagramSurface } from './editable_diagram'
import { EditableDiagramNodes } from './editable_diagram_collections'
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

type RenderCounts = Map<string, number>

function Counted({ children, counts, id }: { children: ReactNode, counts: RenderCounts, id: string }) {
    const handleRender = () => counts.set(id, (counts.get(id) ?? 0) + 1)

    return <Profiler id={id} onRender={handleRender}>{children}</Profiler>
}

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)

    return { geometry, session }
}

/** Counts commits of one node leaf; the surrounding host is measured through its identifier snapshot instead. */
function MeasuredNodes({ counts, geometry, session }: {
    counts: RenderCounts,
    geometry: DiagramGeometryService,
    session: DiagramEditSessionService,
}) {
    return (
        <>
            <EditableDiagramNodes geometry={geometry} onSelect={() => undefined} session={session} />
            <Counted counts={counts} id="orders">
                <EditableDiagramNode geometry={geometry} nodeId="orders" onSelect={() => undefined} session={session} />
            </Counted>
        </>
    )
}

afterEach(cleanup)

describe('editable diagram', () => {
    it('renders metadata, surface, and every collection from service data alone', () => {
        const { geometry, session } = createHarness()
        render(<EditableDiagram geometry={geometry} session={session} />)

        expect(screen.getByText('Overview')).toBeTruthy()
        expect(screen.getByText('Orders architecture')).toBeTruthy()
        expect(screen.getByLabelText('New diagram')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Orders' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Store' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'writes' })).toBeTruthy()
        expect(screen.getByRole('group', { name: 'Backend' })).toBeTruthy()
    })

    it('shows an accepted edit in the New diagram immediately', () => {
        const { geometry, session } = createHarness()
        render(<EditableDiagram geometry={geometry} session={session} />)

        act(() => { session.setNodeField('store', 'label', 'Order store') })

        expect(screen.getByRole('button', { name: 'Order store' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Store' })).toBeNull()
    })

    it('leaves the node collection host untouched when one node field changes', () => {
        const { geometry, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(<MeasuredNodes counts={counts} geometry={geometry} session={session} />)
        const before = new Map(counts)
        const nodeIds = session.getNodeIdsSnapshot()

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(counts.get('orders')).toBeGreaterThan(before.get('orders') ?? 0)
        // The host observes this snapshot only, so an unchanged reference is exactly a skipped host render.
        expect(session.getNodeIdsSnapshot()).toBe(nodeIds)
    })

    it('rerenders the node collection host and adds one leaf when a node is added', () => {
        const { geometry, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(<MeasuredNodes counts={counts} geometry={geometry} session={session} />)
        const before = new Map(counts)
        const nodeIds = session.getNodeIdsSnapshot()

        act(() => { session.createNode({ label: 'Mail', role: 'external' }) })

        expect(session.getNodeIdsSnapshot()).not.toBe(nodeIds)
        expect(screen.getByRole('button', { name: 'Mail' })).toBeTruthy()
        // The added member creates one leaf; the existing leaf is reused rather than rerendered.
        expect(counts.get('orders')).toBe(before.get('orders'))
    })

    it('resizes the surface without rerendering the collection hosts inside it', () => {
        const { geometry, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(
            <EditableDiagramSurface geometry={geometry}>
                <Counted counts={counts} id="host"><div data-testid="surface-child" /></Counted>
            </EditableDiagramSurface>,
        )
        const before = new Map(counts)

        act(() => { session.setNodeField('store', 'x', 2000) })

        expect(geometry.getSurfaceFieldSnapshot('width')).toBeGreaterThan(2000)
        expect(counts.get('host')).toBe(before.get('host'))
    })
})
