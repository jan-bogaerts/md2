import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEdgeDrawingService } from '../../services/diagrams/diagram_edge_drawing_service'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import { DiagramNodePlacementService } from '../../services/diagrams/diagram_node_placement_service'
import { DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramZoomViewport } from './diagram_zoom_viewport'
import { DiagramObjectDetailsService } from './diagram_object_details_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [{ height: 160, id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'], width: 480, x: 200, y: 80 }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal', x: 240, y: 120 },
        { id: 'store', label: 'Store', role: 'store', x: 480, y: 120 },
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
    const selection = new DiagramSelectionService(session, geometry)
    const placement = new DiagramNodePlacementService(session, selection)
    const drawing = new DiagramEdgeDrawingService(session, geometry, selection)

    return {
        drawing,
        geometry,
        movement: new DiagramMoveService(session, geometry, selection),
        placement,
        resize: new DiagramResizeService(session, geometry, selection),
        selection,
        session,
    }
}

function viewportClientPoint(x: number, y: number, scale: number, scrollLeft: number, scrollTop: number) {
    return { clientX: x * scale - scrollLeft + 10, clientY: y * scale - scrollTop + 20 }
}

afterEach(cleanup)

describe('DiagramZoomViewport', () => {
    it('draws one attached edge through scrolled, zoomed New coordinates', () => {
        const { drawing, geometry, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                drawing={drawing}
                geometry={geometry}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        const source = screen.getByRole('button', { name: 'Orders' })
        const target = screen.getByRole('button', { name: 'Store' })
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({bottom: 420, height: 400, left: 10, right: 810, toJSON: () => ({}), top: 20, width: 800, x: 10, y: 20})
        act(() => {
            session.zoomOut()
            drawing.activate({ kind: 'data' })
        })
        scroller.scrollLeft = 20
        scroller.scrollTop = 12
        const scale = session.getViewportScaleSnapshot()
        const sourceX = geometry.getNodeGeometryFieldSnapshot('orders', 'x') as number
        const sourceY = geometry.getNodeGeometryFieldSnapshot('orders', 'y') as number
        const sourceWidth = geometry.getNodeGeometryFieldSnapshot('orders', 'width') as number
        const sourceHeight = geometry.getNodeGeometryFieldSnapshot('orders', 'height') as number
        const targetX = geometry.getNodeGeometryFieldSnapshot('store', 'x') as number
        const targetY = geometry.getNodeGeometryFieldSnapshot('store', 'y') as number
        const targetHeight = geometry.getNodeGeometryFieldSnapshot('store', 'height') as number
        const sourceClientPoint = viewportClientPoint(
            sourceX + sourceWidth,
            sourceY + sourceHeight / 4,
            scale,
            scroller.scrollLeft,
            scroller.scrollTop,
        )
        const targetClientPoint = viewportClientPoint(
            targetX,
            targetY + targetHeight * 3 / 4,
            scale,
            scroller.scrollLeft,
            scroller.scrollTop,
        )

        fireEvent.pointerDown(source, {...sourceClientPoint, button: 0, isPrimary: true, pointerId: 21})
        fireEvent.pointerMove(target, {...targetClientPoint, isPrimary: true, pointerId: 21})

        expect(screen.getByTestId('diagram-edge-drawing-preview')).toBeInTheDocument()
        expect(drawing.getPreviewSnapshot()).toMatchObject({
            sourceAttachment: { nodeId: 'orders', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'store', offset: 0.75, side: 'left' },
        })

        fireEvent.pointerDown(target, {...targetClientPoint, button: 0, isPrimary: true, pointerId: 22})

        const edgeId = session.getEdgeIdsSnapshot().at(-1) as string
        expect(session.getEdgeSnapshot(edgeId)).toMatchObject({
            from: 'orders',
            kind: 'data',
            sourceAttachment: { nodeId: 'orders', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'store', offset: 0.75, side: 'left' },
            to: 'store',
        })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: edgeId, objectKind: 'edge' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(screen.queryByTestId('diagram-edge-drawing-preview')).not.toBeInTheDocument()
    })

    it('keeps an invalid edge target recoverable until Escape cancels it', () => {
        const { drawing, geometry, selection, session } = createHarness()
        render(
            <DiagramZoomViewport drawing={drawing} geometry={geometry} selection={selection} session={session} />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        const source = screen.getByRole('button', { name: 'Orders' })
        act(() => { drawing.activate({ kind: 'connection' }) })

        fireEvent.pointerDown(source, { button: 0, clientX: 400, clientY: 140, isPrimary: true, pointerId: 23 })
        fireEvent.pointerDown(scroller, { button: 0, clientX: 700, clientY: 300, isPrimary: true, pointerId: 24 })

        expect(session.getEdgeIdsSnapshot()).toEqual(['orders-store'])
        expect(session.getActiveToolSnapshot()).toBe('edge:connection')
        expect(drawing.getPreviewSnapshot()).not.toBeNull()

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(session.getEdgeIdsSnapshot()).toEqual(['orders-store'])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(drawing.getPreviewSnapshot()).toBeNull()
    })

    it('previews and places one snapped node through scrolled, zoomed New coordinates', () => {
        const { geometry, placement, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                placement={placement}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({bottom: 420, height: 400, left: 10, right: 810, toJSON: () => ({}), top: 20, width: 800, x: 10, y: 20})
        act(() => {
            session.zoomOut()
            placement.activate({
                defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
                kind: 'component',
            })
        })
        scroller.scrollLeft = 20
        scroller.scrollTop = 12

        fireEvent.pointerMove(scroller, { clientX: 100, clientY: 80, isPrimary: true, pointerId: 8 })
        expect(screen.getByText('New component').closest('button')).toHaveStyle({ left: '148px', top: '96px' })
        expect(session.getNodeIdsSnapshot()).toEqual(['orders', 'store'])

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 8 })
        fireEvent.pointerUp(scroller, { clientX: 100, clientY: 80, pointerId: 8 })
        fireEvent.click(scroller)

        const nodeId = session.getNodeIdsSnapshot()[2]
        expect(session.getNodeSnapshot(nodeId)).toMatchObject({ kind: 'component', x: 148, y: 96 })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: nodeId, objectKind: 'node' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(screen.getByRole('button', { name: 'New component' })).not.toHaveAttribute('aria-disabled')
    })

    it('creates nothing when pointer cancellation ends node placement', () => {
        const { geometry, placement, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                placement={placement}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => {
            placement.activate({
                defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
                kind: 'component',
            })
        })

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 9 })
        fireEvent.pointerCancel(scroller, { pointerId: 9 })

        expect(session.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(screen.queryByText('New component')).not.toBeInTheDocument()
    })

    it('opens node details on double-click without moving diagram data', async () => {
        const { geometry, movement, selection, session } = createHarness()
        const details = new DiagramObjectDetailsService()
        const user = userEvent.setup()
        render(
            <DiagramZoomViewport
                details={details}
                geometry={geometry}
                movement={movement}
                selection={selection}
                session={session}
            />,
        )
        const x = session.getNodeFieldSnapshot('orders', 'x')
        const y = session.getNodeFieldSnapshot('orders', 'y')

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))

        expect(details.getTargetSnapshot()).toEqual({ objectId: 'orders', objectKind: 'node' })
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(x)
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBe(y)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(movement.getMoveActiveSnapshot()).toBe(false)
    })

    it('scales only rendered New content and preserves visible center', () => {
        const { geometry, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        Object.defineProperties(scroller, {
            clientHeight: { configurable: true, value: 100 },
            clientWidth: { configurable: true, value: 200 },
        })
        scroller.scrollLeft = 100
        scroller.scrollTop = 50

        act(() => { session.zoomIn() })

        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({
            transformOrigin: 'top left',
            zoom: DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP,
        })
        expect(scroller.scrollLeft).toBe(150)
        expect(scroller.scrollTop).toBe(75)
    })

    it('preserves visible center and canonical geometry while zooming out', () => {
        const { geometry, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const editableDiagram = session.getEditableDiagram()
        Object.defineProperties(scroller, {
            clientHeight: { configurable: true, value: 100 },
            clientWidth: { configurable: true, value: 200 },
        })
        scroller.scrollLeft = 100
        scroller.scrollTop = 50

        act(() => { session.zoomOut() })

        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({
            transformOrigin: 'top left',
            zoom: DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP,
        })
        expect(scroller.scrollLeft).toBe(50)
        expect(scroller.scrollTop).toBe(25)
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getEditableDiagram()?.nodes[0]).toMatchObject({ x: 240, y: 120 })
    })

    it('keeps direct node selection working on transformed New content', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)

        act(() => { session.zoomOut() })
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }), { clientX: 190, clientY: 120 })

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders', objectKind: 'node' }])
    })

    it('keeps rectangle diagram coordinates stable through viewport scroll and zoom', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const surface = screen.getByLabelText('New diagram')
        Object.defineProperty(surface, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ bottom: 230, height: 200, left: 20, right: 420, top: 30, width: 400, x: 20, y: 30 }),
        })
        scroller.scrollLeft = 40
        scroller.scrollTop = 20
        act(() => { session.zoomOut() })
        const scale = session.getViewportScaleSnapshot()

        fireEvent.pointerDown(surface, { button: 0, clientX: 95, clientY: 67.5, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 245, clientY: 142.5, pointerId: 1 })

        expect(screen.getByTestId('diagram-selection-rectangle')).toHaveStyle({
            height: '100px',
            left: '100px',
            top: '50px',
            width: '200px',
        })
        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({ zoom: scale })

        scroller.scrollLeft = 80
        scroller.scrollTop = 60
        expect(screen.getByTestId('diagram-selection-rectangle')).toHaveStyle({
            left: '100px',
            top: '50px',
        })
    })

    it('moves complete selection through scrolled, zoomed viewport coordinates and preserves it after click', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const orders = screen.getByRole('button', { name: 'Orders' })
        scroller.scrollLeft = 20
        scroller.scrollTop = 10
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ bottom: 410, height: 400, left: 10, right: 810, toJSON: () => ({}), top: 10, width: 800, x: 10, y: 10 })
        act(() => {
            session.zoomOut()
            selection.replace([
                { objectId: 'orders', objectKind: 'node' },
                { objectId: 'store', objectKind: 'node' },
            ])
        })

        fireEvent.pointerDown(orders, { button: 0, clientX: 110, clientY: 70, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 134, clientY: 94, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })
        fireEvent.click(orders)

        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 272, y: 152 })
        expect(session.getNodeSnapshot('store')).toMatchObject({ x: 512, y: 152 })
        expect(selection.getSelectionSnapshot()).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
        ])
    })

    it('selects a drag target on pointer down and restores its geometry on pointer cancellation', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const orders = screen.getByRole('button', { name: 'Orders' })

        fireEvent.pointerDown(orders, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 2 })
        fireEvent.pointerMove(scroller, { clientX: 124, clientY: 112, pointerId: 2 })
        fireEvent.pointerCancel(scroller, { pointerId: 2 })

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders', objectKind: 'node' }])
        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 240, y: 120 })
        expect(movement.getMoveActiveSnapshot()).toBe(false)
    })

    it('cancels and releases an active pointer when another interaction replaces move', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const orders = screen.getByRole('button', { name: 'Orders' })

        fireEvent.pointerDown(orders, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 3 })
        fireEvent.pointerMove(scroller, { clientX: 116, clientY: 100, pointerId: 3 })
        act(() => { session.setActiveTool('group') })
        fireEvent.pointerMove(scroller, { clientX: 132, clientY: 100, pointerId: 3 })

        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 240, y: 120 })
        expect(movement.getMoveActiveSnapshot()).toBe(false)
    })

    it('selects an edge without translating geometry when its pointer moves', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const edge = screen.getByRole('button', { name: 'writes' })

        fireEvent.pointerDown(edge, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 5 })
        fireEvent.pointerMove(scroller, { clientX: 132, clientY: 124, pointerId: 5 })
        fireEvent.pointerUp(scroller, { pointerId: 5 })

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders-store', objectKind: 'edge' }])
        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 240, y: 120 })
        expect(session.getNodeSnapshot('store')).toMatchObject({ x: 480, y: 120 })
        expect(movement.getMoveActiveSnapshot()).toBe(false)
    })

    it('resizes through scrolled, zoomed viewport coordinates without moving the selection', () => {
        const { geometry, movement, resize, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                movement={movement}
                resize={resize}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        scroller.scrollLeft = 20
        scroller.scrollTop = 10
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ bottom: 410, height: 400, left: 10, right: 810, toJSON: () => ({}), top: 10, width: 800, x: 10, y: 10 })
        act(() => {
            session.zoomOut()
            selection.replace([{ objectId: 'orders', objectKind: 'node' }])
        })
        const handle = screen.getByRole('button', { name: 'Resize Orders south-east' })

        fireEvent.pointerDown(handle, { button: 0, clientX: 110, clientY: 70, isPrimary: true, pointerId: 6 })
        fireEvent.pointerMove(scroller, { clientX: 122, clientY: 78, pointerId: 6 })
        fireEvent.pointerUp(scroller, { pointerId: 6 })

        expect(session.getNodeSnapshot('orders')).toMatchObject({ height: 84, width: 176, x: 240, y: 120 })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders', objectKind: 'node' }])
        expect(resize.getResizeActiveSnapshot()).toBe(false)
    })

    it('supports keyboard resizing and restores pointer resize when Escape cancels it', () => {
        const { geometry, movement, resize, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                movement={movement}
                resize={resize}
                selection={selection}
                session={session}
            />,
        )
        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })
        const handle = screen.getByRole('button', { name: 'Resize Orders east' })

        fireEvent.keyDown(handle, { key: 'ArrowRight' })
        expect(session.getNodeSnapshot('orders')).toMatchObject({ height: 72, width: 164 })

        const scroller = screen.getByLabelText('New diagram scroller')
        fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 7 })
        fireEvent.pointerMove(scroller, { clientX: 116, clientY: 100, pointerId: 7 })
        fireEvent.keyDown(window, { key: 'Escape' })

        expect(session.getNodeSnapshot('orders')).toMatchObject({ height: 72, width: 164 })
        expect(resize.getResizeActiveSnapshot()).toBe(false)
    })
})
