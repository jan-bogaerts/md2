import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import { DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import { DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramZoomViewport } from './diagram_zoom_viewport'

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

    return {
        geometry,
        movement: new DiagramMoveService(session, geometry, selection),
        resize: new DiagramResizeService(session, geometry, selection),
        selection,
        session,
    }
}

afterEach(cleanup)

describe('DiagramZoomViewport', () => {
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
