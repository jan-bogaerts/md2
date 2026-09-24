import { Profiler, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramType } from '../../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramMoveService } from '../../../services/diagrams/diagram_move_service'
import { DiagramResizeService } from '../../../services/diagrams/diagram_resize_service'
import { DiagramSelectionService } from '../../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service'
import {
    EditableDiagram,
    EditableDiagramDescription,
    EditableDiagramSurface,
    EditableDiagramTitle,
} from './editable_diagram'
import { EditableDiagramNodes } from './editable_diagram_collections'
import { EditableDiagramNode } from './editable_diagram_node'
import { DiagramZoomViewport } from '../surface/diagram_zoom_viewport'
import { DiagramObjectDetailsService } from '../details/diagram_object_details_service'

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
    private readonly source: DiagramViewSourceSnapshot

    constructor(sourceDiagram: DiagramData = diagram) {
        super()
        this.source = { diagram: sourceDiagram, record }
    }

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

function MeasuredMetadata({ counts, onRootRender, session }: {
    counts: RenderCounts,
    onRootRender: () => void,
    session: DiagramEditSessionService,
}) {
    onRootRender()

    return (
        <>
            <Counted counts={counts} id="title"><EditableDiagramTitle session={session} /></Counted>
            <Counted counts={counts} id="description"><EditableDiagramDescription session={session} /></Counted>
        </>
    )
}

function createHarness(sourceDiagram: DiagramData = diagram) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(sourceDiagram))
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)

    return { geometry, selection: new DiagramSelectionService(session), session }
}

/** Counts commits of one node leaf; the surrounding host is measured through its identifier snapshot instead. */
function MeasuredNodes({ counts, geometry, selection, session }: {
    counts: RenderCounts,
    geometry: DiagramGeometryService,
    selection: DiagramSelectionService,
    session: DiagramEditSessionService,
}) {
    return (
        <>
            <EditableDiagramNodes geometry={geometry} selection={selection} session={session} />
            <Counted counts={counts} id="orders">
                <EditableDiagramNode geometry={geometry} nodeId="orders" selection={selection} session={session} />
            </Counted>
        </>
    )
}

afterEach(cleanup)

describe('editable diagram', () => {
    it.each(['architecture', 'dependency', 'entity', 'flow', 'mindmap', 'sequence'] as DiagramType[])(
        'edits title and subtitle on a %s diagram', (type) => {
            const sourceDiagram: DiagramData = {
                edges: [], groups: [], nodes: [],
                meta: {
                    description: 'Original subtitle', title: 'Original title', type, version: 1,
                    ...(type === 'flow' ? { preset: 'flowchart' as const } : {}),
                },
            }
            const { session } = createHarness(sourceDiagram)
            render(<><EditableDiagramTitle session={session} /><EditableDiagramDescription session={session} /></>)

            const title = screen.getByRole('textbox', { name: 'Diagram title' })
            const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' })
            fireEvent.change(title, { target: { value: 'New title' } })
            fireEvent.blur(title)
            fireEvent.change(subtitle, { target: { value: 'New subtitle' } })
            fireEvent.blur(subtitle)

            expect(session.getMetadataFieldSnapshot('title')).toBe('New title')
            expect(session.getMetadataFieldSnapshot('description')).toBe('New subtitle')
        },
    )

    it('edits title and subtitle in place and rejects blank title', () => {
        const { geometry, selection, session } = createHarness()
        render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)
        const title = screen.getByRole('textbox', { name: 'Diagram title' })
        const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' })

        fireEvent.change(title, { target: { value: 'Revised overview' } })
        fireEvent.blur(title)
        fireEvent.change(subtitle, { target: { value: 'Revised description' } })
        fireEvent.blur(subtitle)

        expect(session.getMetadataFieldSnapshot('title')).toBe('Revised overview')
        expect(session.getMetadataFieldSnapshot('description')).toBe('Revised description')
        fireEvent.change(title, { target: { value: ' ' } })
        fireEvent.blur(title)
        expect(screen.getByText('Title is required.')).toBeInTheDocument()
        expect(session.getMetadataFieldSnapshot('title')).toBe('Revised overview')
    })

    it('edits node label in place and opens details from its action', () => {
        const { geometry, selection, session } = createHarness()
        const details = new DiagramObjectDetailsService()
        render(<EditableDiagram details={details} geometry={geometry} selection={selection} session={session} />)
        const label = screen.getByRole('textbox', { name: 'Edit Orders label' })

        fireEvent.change(label, { target: { value: 'Purchases' } })
        fireEvent.blur(label)
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
        fireEvent.pointerDown(label, { button: 0, clientX: 20, clientY: 20, pointerId: 1 })
        expect(selection.getSelectionSnapshot()).toEqual([])
        fireEvent.change(screen.getByRole('textbox', { name: 'Edit Purchases label' }), { target: { value: '' } })
        fireEvent.blur(screen.getByRole('textbox', { name: 'Edit Purchases label' }))
        expect(screen.getByText('Label is required.')).toBeInTheDocument()
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')

        fireEvent.click(screen.getByRole('button', { name: 'Details for Purchases' }))
        expect(details.getTargetSnapshot()).toEqual({ objectId: 'orders', objectKind: 'node' })
    })

    it('keeps double-click on an inline node label opening details', () => {
        const { geometry, selection, session } = createHarness()
        const details = new DiagramObjectDetailsService()
        render(<EditableDiagram details={details} geometry={geometry} selection={selection} session={session} />)

        fireEvent.doubleClick(screen.getByRole('textbox', { name: 'Edit Orders label' }))

        expect(details.getTargetSnapshot()).toEqual({ objectId: 'orders', objectKind: 'node' })
    })

    it('renders metadata, surface, and every collection from service data alone', () => {
        const { geometry, selection, session } = createHarness()
        render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)

        expect(screen.getByRole('textbox', { name: 'Diagram title' })).toHaveValue('Overview')
        expect(screen.getByRole('textbox', { name: 'Diagram subtitle' })).toHaveValue('Orders architecture')
        expect(screen.getByLabelText('New diagram')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Orders' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Store' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'writes' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Backend' })).toBeTruthy()
    })

    it.each([
        ['title', 'title', 'description'],
        ['description', 'description', 'title'],
    ] as const)('rerenders only the %s metadata leaf', (field, changedLeaf, unchangedLeaf) => {
        const { session } = createHarness()
        const counts: RenderCounts = new Map()
        const onRootRender = vi.fn()
        render(<MeasuredMetadata counts={counts} onRootRender={onRootRender} session={session} />)
        const before = new Map(counts)

        act(() => { session.setMetadataField(field, `Updated ${field}`) })

        expect(counts.get(changedLeaf)).toBeGreaterThan(before.get(changedLeaf) ?? 0)
        expect(counts.get(unchangedLeaf)).toBe(before.get(unchangedLeaf))
        expect(onRootRender).toHaveBeenCalledOnce()
    })

    it('shows an accepted edit in the New diagram immediately', () => {
        const { geometry, selection, session } = createHarness()
        render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)

        act(() => { session.setNodeField('store', 'label', 'Order store') })

        expect(screen.getByRole('button', { name: 'Order store' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Store' })).toBeNull()
    })

    it('leaves the node collection host untouched when one node field changes', () => {
        const { geometry, selection, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(<MeasuredNodes counts={counts} geometry={geometry} selection={selection} session={session} />)
        const before = new Map(counts)
        const nodeIds = session.getNodeIdsSnapshot()

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(counts.get('orders')).toBeGreaterThan(before.get('orders') ?? 0)
        // The host observes this snapshot only, so an unchanged reference is exactly a skipped host render.
        expect(session.getNodeIdsSnapshot()).toBe(nodeIds)
    })

    it('rerenders the node collection host and adds one leaf when a node is added', () => {
        const { geometry, selection, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(<MeasuredNodes counts={counts} geometry={geometry} selection={selection} session={session} />)
        const before = new Map(counts)
        const nodeIds = session.getNodeIdsSnapshot()

        act(() => { session.createNode({ label: 'Mail', role: 'external' }) })

        expect(session.getNodeIdsSnapshot()).not.toBe(nodeIds)
        expect(screen.getByRole('button', { name: 'Mail' })).toBeTruthy()
        // The added member creates one leaf; the existing leaf is reused rather than rerendered.
        expect(counts.get('orders')).toBe(before.get('orders'))
    })

    it('resizes the surface without rerendering the collection hosts inside it', () => {
        const { geometry, selection, session } = createHarness()
        const counts: RenderCounts = new Map()
        render(
            <EditableDiagramSurface geometry={geometry} selection={selection} session={session}>
                <Counted counts={counts} id="host"><div data-testid="surface-child" /></Counted>
            </EditableDiagramSurface>,
        )
        const before = new Map(counts)

        act(() => { session.setNodeField('store', 'x', 2000) })

        expect(geometry.getSurfaceFieldSnapshot('width')).toBeGreaterThan(2000)
        expect(counts.get('host')).toBe(before.get('host'))
    })

    it('keeps collections and an unmoved leaf isolated during pointer movement', () => {
        const { geometry, selection, session } = createHarness()
        const movement = new DiagramMoveService(session, geometry, selection)
        const counts: RenderCounts = new Map()
        const nodeIds = session.getNodeIdsSnapshot()
        const ViewportHarness = () => {
            return (
                <>
                    <DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />
                    <Counted counts={counts} id="unmoved-store">
                        <EditableDiagramNode geometry={geometry} nodeId="store" selection={selection} session={session} />
                    </Counted>
                </>
            )
        }
        render(<ViewportHarness />)
        const before = new Map(counts)
        const scroller = screen.getByLabelText('New diagram scroller')
        const orders = within(scroller).getByRole('button', { name: 'Orders' })

        fireEvent.pointerDown(orders, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 6 })
        fireEvent.pointerMove(scroller, { clientX: 116, clientY: 100, pointerId: 6 })
        fireEvent.pointerUp(scroller, { pointerId: 6 })

        expect(counts.get('unmoved-store')).toBe(before.get('unmoved-store'))
        expect(session.getNodeIdsSnapshot()).toBe(nodeIds)
    })

    it('keeps collections and an unrelated leaf isolated during resize', () => {
        const { geometry, selection, session } = createHarness()
        const movement = new DiagramMoveService(session, geometry, selection)
        const resize = new DiagramResizeService(session, geometry, selection)
        const counts: RenderCounts = new Map()
        const nodeIds = session.getNodeIdsSnapshot()
        const ViewportHarness = () => {
            return (
                <>
                    <DiagramZoomViewport
                        geometry={geometry}
                        movement={movement}
                        resize={resize}
                        selection={selection}
                        session={session}
                    />
                    <Counted counts={counts} id="unrelated-store">
                        <EditableDiagramNode geometry={geometry} nodeId="store" selection={selection} session={session} />
                    </Counted>
                </>
            )
        }
        render(<ViewportHarness />)
        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })
        const before = new Map(counts)
        const scroller = screen.getByLabelText('New diagram scroller')
        const handle = within(scroller).getByRole('button', { name: 'Resize Orders east' })

        fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 7 })
        fireEvent.pointerMove(scroller, { clientX: 116, clientY: 100, pointerId: 7 })
        fireEvent.pointerUp(scroller, { pointerId: 7 })

        expect(counts.get('unrelated-store')).toBe(before.get('unrelated-store'))
        expect(session.getNodeIdsSnapshot()).toBe(nodeIds)
    })
})
