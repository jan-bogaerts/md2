import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import { DiagramEdgeDrawingService } from '../../../services/diagrams/diagram_edge_drawing_service'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../../services/diagrams/diagram_geometry_service'
import { DiagramGroupDrawingService } from '../../../services/diagrams/diagram_group_drawing_service'
import { DiagramMoveService } from '../../../services/diagrams/diagram_move_service'
import { DiagramNodePlacementService } from '../../../services/diagrams/diagram_node_placement_service'
import { DiagramResizeService } from '../../../services/diagrams/diagram_resize_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service'
import { DEFAULT_DIAGRAM_ZOOM, DIAGRAM_ZOOM_STEP } from '../../../services/diagrams/diagram_zoom'
import { DiagramZoomViewport } from './diagram_zoom_viewport'
import { DiagramObjectDetailsService } from '../details/diagram_object_details_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [{ height: 160, id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'], width: 480, x: 200, y: 80 }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal', x: 240, y: 120 },
        { id: 'store', label: 'Store', role: 'store', x: 480, y: 120 },
    ],
}
const sequenceDiagram: DiagramData = {
    edges: [
        { from: 'orders', id: 'orders-store', kind: 'call', label: 'writes', to: 'store' },
        { from: 'store', id: 'store-orders', kind: 'return', label: 'done', to: 'orders' },
    ],
    groups: [],
    meta: { description: 'Orders sequence', title: 'Sequence', type: 'sequence', version: 1 },
    nodes: [
        { id: 'orders', kind: 'participant', label: 'Orders', role: 'focal', x: 40, y: 40 },
        { id: 'store', kind: 'participant', label: 'Store', role: 'store', x: 256, y: 40 },
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

function createHarness(sourceDiagram: DiagramData = diagram) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(sourceDiagram))
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session, geometry)
    const placement = new DiagramNodePlacementService(session, selection)
    const drawing = new DiagramEdgeDrawingService(session, geometry, selection)
    const groupDrawing = new DiagramGroupDrawingService(session, selection)

    return {
        drawing,
        geometry,
        groupDrawing,
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

function dispatchWheel(scroller: HTMLElement, options: WheelEventInit) {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options })
    act(() => { scroller.dispatchEvent(event) })

    return event
}

let viewportResizeCallback: ResizeObserverCallback | null = null

class ViewportResizeObserverStub {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) { this.callback = callback }
    observe(target: Element) {
        if (target.getAttribute('aria-label') === 'New diagram scroller') viewportResizeCallback = this.callback
    }
    disconnect() {
        if (viewportResizeCallback === this.callback) viewportResizeCallback = null
    }
}

function triggerViewportResize() {
    const callback = viewportResizeCallback
    if (!callback) throw new Error('Expected viewport resize observer')
    act(() => { callback([], {} as ResizeObserver) })
}

function expectViewportScrollRange(
    scroller: HTMLElement,
    drawingSurface: HTMLElement,
    geometry: DiagramGeometryService,
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
) {
    const scrollerStyle = window.getComputedStyle(scroller)
    const editor = screen.getByLabelText('New diagram editor')
    const editorBottomPadding = Number.parseFloat(window.getComputedStyle(editor).paddingBottom) * scale
    const horizontalPadding = Number.parseFloat(scrollerStyle.paddingLeft) + Number.parseFloat(scrollerStyle.paddingRight)
    const verticalPadding = Number.parseFloat(scrollerStyle.paddingTop) + Number.parseFloat(scrollerStyle.paddingBottom)
    const width = geometry.getSurfaceFieldSnapshot('width') * scale + horizontalPadding - viewportWidth
    const height = geometry.getSurfaceFieldSnapshot('height') * scale + verticalPadding
        + 80 * scale + editorBottomPadding - viewportHeight

    expect(width).toBeGreaterThanOrEqual(64)
    expect(height).toBeGreaterThanOrEqual(64)
    expect(drawingSurface).toHaveStyle({
        height: `${geometry.getSurfaceFieldSnapshot('height')}px`,
        width: `${geometry.getSurfaceFieldSnapshot('width')}px`,
    })
}

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('DiagramZoomViewport', () => {
    it.each(['empty', 'small'])('keeps a scrollable drawing surface for %s diagrams through resize and zoom', (kind) => {
        const meta: DiagramData['meta'] = { description: '', title: kind, type: 'architecture', version: 1 }
        const nodes: DiagramData['nodes'] = kind === 'small'
            ? [{ id: 'small', label: 'Small', role: 'focal', x: 40, y: 40 }] : []
        const sourceDiagram: DiagramData = { edges: [], groups: [], meta, nodes }
        const { geometry, groupDrawing, placement, selection, session } = createHarness(sourceDiagram)
        const originalJson = JSON.stringify(session.getEditableDiagram())
        viewportResizeCallback = null
        vi.stubGlobal('ResizeObserver', ViewportResizeObserverStub)
        render(
            <DiagramZoomViewport
                geometry={geometry} groupDrawing={groupDrawing} placement={placement} selection={selection} session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        const zoomSurface = screen.getByTestId('new-diagram-zoom-surface')
        const drawingSurface = screen.getByLabelText('New diagram')
        let viewportWidth = 400
        let viewportHeight = 300
        Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => viewportWidth })
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => viewportHeight })
        const zeroBounds = { bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 }
        vi.spyOn(zoomSurface, 'getBoundingClientRect').mockReturnValue(zeroBounds)
        vi.spyOn(drawingSurface, 'getBoundingClientRect').mockImplementation(() => {
            const top = 80 * session.getViewportScaleSnapshot()

            return { bottom: top, height: 0, left: 0, right: 0, toJSON: () => ({}), top, width: 0, x: 0, y: top }
        })
        expect(scroller).toHaveStyle({ overflowX: 'scroll', overflowY: 'scroll' })
        triggerViewportResize()
        expectViewportScrollRange(scroller, drawingSurface, geometry, 1, viewportWidth, viewportHeight)
        act(() => { session.setViewportScale(0.05) })
        expectViewportScrollRange(scroller, drawingSurface, geometry, 0.05, viewportWidth, viewportHeight)
        act(() => { session.setViewportScale(2) })
        expectViewportScrollRange(scroller, drawingSurface, geometry, 2, viewportWidth, viewportHeight)
        viewportWidth = 700
        viewportHeight = 500
        triggerViewportResize()
        expectViewportScrollRange(scroller, drawingSurface, geometry, 2, viewportWidth, viewportHeight)
        fireEvent.pointerDown(drawingSurface, { button: 0, clientX: 500, clientY: 400, pointerId: 1, pointerType: 'mouse' })
        expect(selection.getRectangleSnapshot()).not.toBeNull()
        fireEvent.pointerUp(drawingSurface, { clientX: 500, clientY: 400, pointerId: 1 })
        expect(session.getDirtySnapshot()).toBe(false)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(JSON.stringify(session.getEditableDiagram())).toBe(originalJson)

        viewportHeight = 700
        triggerViewportResize()
        expectViewportScrollRange(scroller, drawingSurface, geometry, 2, viewportWidth, viewportHeight)
        act(() => { groupDrawing.activate() })
        fireEvent.pointerDown(drawingSurface, { button: 0, clientX: 500, clientY: 560, isPrimary: true, pointerId: 2 })
        fireEvent.pointerMove(drawingSurface, { clientX: 600, clientY: 600, pointerId: 2 })
        fireEvent.pointerUp(drawingSurface, { clientX: 600, clientY: 600, pointerId: 2 })
        expect(groupDrawing.getPendingLabelBoxSnapshot()).toMatchObject({ x: 252, y: 200 })
        act(() => { groupDrawing.cancelDrawing() })

        const minimumWidth = geometry.getSurfaceFieldSnapshot('width')
        const minimumHeight = geometry.getSurfaceFieldSnapshot('height')
        act(() => { placement.activate({ defaults: { height: 72, label: 'Placed', role: 'focal', width: 160 }, kind: 'component' }) })
        fireEvent.pointerDown(drawingSurface, { button: 0, clientX: 500, clientY: 560, isPrimary: true, pointerId: 3 })
        fireEvent.pointerUp(drawingSurface, { clientX: 500, clientY: 560, pointerId: 3 })
        expect(session.getEditableDiagram()?.nodes).toHaveLength(sourceDiagram.nodes.length + 1)
        expect(session.getEditableDiagram()?.nodes.at(-1)).toMatchObject({ x: 252, y: 200 })
        expect(geometry.getSurfaceFieldSnapshot('width')).toBeGreaterThan(minimumWidth)
        expect(geometry.getSurfaceFieldSnapshot('height')).toBeGreaterThan(minimumHeight)
    })

    it('keeps editable title and subtitle in one sticky header above drawing', () => {
        const { geometry, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} session={session} />)
        const title = screen.getByRole('textbox', { name: 'Diagram title' })
        const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' })
        const header = title.closest('.MuiBox-root')

        expect(header).toContainElement(subtitle)
        expect(window.getComputedStyle(header as Element).position).toBe('sticky')
        expect((header as HTMLElement).compareDocumentPosition(screen.getByLabelText('New diagram')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('preserves scroller position when a node expands left and top margins at zoom', () => {
        const { geometry, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => { session.setViewportScale(1.5) })
        scroller.scrollLeft = 120
        scroller.scrollTop = 80
        const oldOriginX = geometry.getSurfaceFieldSnapshot('originX')
        const oldOriginY = geometry.getSurfaceFieldSnapshot('originY')

        act(() => {
            session.setNodeField('orders', 'x', 20)
            session.setNodeField('orders', 'y', 20)
        })

        expect(geometry.getSurfaceFieldSnapshot('originX')).toBeGreaterThan(oldOriginX)
        expect(geometry.getSurfaceFieldSnapshot('originY')).toBeGreaterThan(oldOriginY)
        expect(scroller.scrollLeft).toBe(120 + (geometry.getSurfaceFieldSnapshot('originX') - oldOriginX) * 1.5)
        expect(scroller.scrollTop).toBe(80 + (geometry.getSurfaceFieldSnapshot('originY') - oldOriginY) * 1.5)
    })

    it('places at canonical pointer coordinates after left and top growth at zoom', () => {
        const { geometry, placement, session } = createHarness()
        session.setNodeField('orders', 'x', 20)
        session.setNodeField('orders', 'y', 20)
        render(<DiagramZoomViewport geometry={geometry} placement={placement} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const drawingSurface = screen.getByLabelText('New diagram')
        vi.spyOn(drawingSurface, 'getBoundingClientRect').mockReturnValue({bottom: 620, height: 600, left: 10, right: 810, toJSON: () => ({}), top: 20, width: 800, x: 10, y: 20})
        act(() => {
            session.setViewportScale(1.5)
            placement.activate({ defaults: { height: 72, label: 'Placed', role: 'focal', width: 160 }, kind: 'component' })
        })
        const clientX = 10 + (100 + geometry.getSurfaceFieldSnapshot('originX')) * 1.5
        const clientY = 20 + (80 + geometry.getSurfaceFieldSnapshot('originY')) * 1.5

        fireEvent.pointerMove(scroller, { clientX, clientY, isPrimary: true, pointerId: 91 })
        expect(placement.getPreviewSnapshot()?.node).toMatchObject({ x: 100, y: 80 })
        fireEvent.pointerDown(scroller, { button: 0, clientX, clientY, isPrimary: true, pointerId: 91 })
        fireEvent.pointerUp(scroller, { clientX, clientY, pointerId: 91 })
        const placedId = session.getNodeIdsSnapshot().find((nodeId) => nodeId !== 'orders' && nodeId !== 'store')
        expect(session.getNodeSnapshot(placedId as string)).toMatchObject({ x: 100, y: 80 })
    })

    it('starts and finishes a connection over inline label inputs', () => {
        const { drawing, geometry, session } = createHarness()
        render(<DiagramZoomViewport drawing={drawing} geometry={geometry} session={session} />)
        const sourceInput = screen.getByRole('textbox', { name: 'Edit Orders label' })
        const targetInput = screen.getByRole('textbox', { name: 'Edit Store label' })
        act(() => { drawing.activate({ kind: 'connection' }) })

        fireEvent.pointerDown(sourceInput, { button: 0, clientX: 320, clientY: 160, isPrimary: true, pointerId: 71 })
        fireEvent.pointerMove(targetInput, { clientX: 540, clientY: 160, isPrimary: true, pointerId: 72 })
        expect(drawing.getPreviewSnapshot()?.targetAttachment?.nodeId).toBe('store')
        fireEvent.pointerDown(targetInput, { button: 0, clientX: 540, clientY: 160, isPrimary: true, pointerId: 72 })
        expect(session.getEdgeIdsSnapshot()).toHaveLength(2)
    })

    it('targets entity field text in preview and completion', () => {
        const source: DiagramData = {
            edges: [], groups: [],
            meta: { description: 'Entities', title: 'Entities', type: 'entity', version: 1 },
            nodes: [
                { fields: [{ name: 'sourceField' }], id: 'orders', kind: 'entity', label: 'Orders', role: 'focal', x: 40, y: 40 },
                { fields: [{ name: 'targetField' }], id: 'store', kind: 'entity', label: 'Store', role: 'store', x: 240, y: 40 },
            ],
        }
        const { drawing, geometry, session } = createHarness(source)
        render(<DiagramZoomViewport drawing={drawing} geometry={geometry} session={session} />)
        act(() => { drawing.activate({ kind: 'relationship' }) })

        fireEvent.pointerDown(screen.getByText('sourceField'), { button: 0, clientX: 80, clientY: 80, isPrimary: true, pointerId: 81 })
        fireEvent.pointerMove(screen.getByText('targetField'), { clientX: 280, clientY: 80, isPrimary: true, pointerId: 82 })
        expect(drawing.getPreviewSnapshot()?.targetAttachment?.nodeId).toBe('store')
        fireEvent.pointerDown(screen.getByText('targetField'), { button: 0, clientX: 280, clientY: 80, isPrimary: true, pointerId: 82 })
        expect(session.getEdgeIdsSnapshot()).toHaveLength(1)
    })

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
            session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
            drawing.activate({ kind: 'data' })
        })
        scroller.scrollLeft = 20
        scroller.scrollTop = 12
        vi.spyOn(screen.getByLabelText('New diagram'), 'getBoundingClientRect').mockReturnValue({bottom: 408, height: 400, left: -10, right: 790, toJSON: () => ({}), top: 8, width: 800, x: -10, y: 8})
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

    it('keeps node and group Add tools active on Escape', () => {
        const { geometry, groupDrawing, placement, selection, session } = createHarness()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                groupDrawing={groupDrawing}
                placement={placement}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => {
            placement.activate({ defaults: { height: 72, label: 'New component', role: 'focal', width: 160 }, kind: 'component' })
        })

        fireEvent.keyDown(window, { key: 'Escape' })
        expect(session.getActiveToolSnapshot()).toBe('node:component')

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 27 })
        fireEvent.keyDown(window, { key: 'Escape' })
        fireEvent.pointerUp(scroller, { clientX: 100, clientY: 80, pointerId: 27 })
        expect(session.getNodeIdsSnapshot()).toHaveLength(3)

        act(() => { groupDrawing.activate() })
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(session.getActiveToolSnapshot()).toBe('group')
    })

    it('keeps an edge Add tool without a chosen source active on Escape', () => {
        const { drawing, geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport drawing={drawing} geometry={geometry} selection={selection} session={session} />)
        act(() => { drawing.activate({ kind: 'connection' }) })

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(session.getActiveToolSnapshot()).toBe('edge:connection')
    })

    it('keeps node, edge, and group Add tools active when Ctrl is held as the add commits', async () => {
        const { drawing, geometry, groupDrawing, placement, selection, session } = createHarness()
        const user = userEvent.setup()
        render(
            <DiagramZoomViewport
                drawing={drawing}
                geometry={geometry}
                groupDrawing={groupDrawing}
                placement={placement}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => {
            placement.activate({ defaults: { height: 72, label: 'New component', role: 'focal', width: 160 }, kind: 'component' })
        })

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 41 })
        fireEvent.pointerUp(scroller, { clientX: 100, clientY: 80, ctrlKey: true, pointerId: 41 })
        expect(session.getNodeIdsSnapshot()).toHaveLength(3)
        expect(session.getActiveToolSnapshot()).toBe('node:component')

        act(() => { drawing.activate({ kind: 'connection' }) })
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Orders' }), { button: 0, clientX: 400, clientY: 140, isPrimary: true, pointerId: 42 })
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Store' }), { button: 0, clientX: 520, clientY: 140, ctrlKey: true, isPrimary: true, pointerId: 43 })
        expect(session.getEdgeIdsSnapshot()).toHaveLength(2)
        expect(session.getActiveToolSnapshot()).toBe('edge:connection')

        act(() => { groupDrawing.activate() })
        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 44 })
        fireEvent.pointerMove(scroller, { clientX: 220, clientY: 180, pointerId: 44 })
        fireEvent.pointerUp(scroller, { clientX: 220, clientY: 180, ctrlKey: true, pointerId: 44 })
        await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Platform')
        await user.click(screen.getByRole('button', { name: 'Save' }))
        expect(session.getGroupIdsSnapshot()).toHaveLength(2)
        expect(session.getActiveToolSnapshot()).toBe('group')
    })

    it('uses sequence lifelines to insert a message at the chosen row', () => {
        const { drawing, geometry, selection, session } = createHarness(sequenceDiagram)
        render(<DiagramZoomViewport drawing={drawing} geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const sourceLifeline = document.querySelector('[data-diagram-connection-target="orders"]:not([data-diagram-id])')
        const targetLifeline = document.querySelector('[data-diagram-connection-target="store"]:not([data-diagram-id])')
        if (!sourceLifeline || !targetLifeline) throw new Error('Expected sequence lifeline targets')
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({bottom: 500, height: 500, left: 0, right: 700, toJSON: () => ({}), top: 0, width: 700, x: 0, y: 0})
        act(() => { drawing.activate({ kind: 'async' }) })

        fireEvent.pointerDown(sourceLifeline, { button: 0, clientX: 120, clientY: 200, isPrimary: true, pointerId: 25 })
        fireEvent.pointerDown(targetLifeline, { button: 0, clientX: 336, clientY: 200, isPrimary: true, pointerId: 26 })

        expect(session.getEdgeIdsSnapshot()).toHaveLength(3)
        const insertedId = session.getEdgeIdsSnapshot()[1]
        expect(session.getEdgeSnapshot(insertedId)).toMatchObject({ from: 'orders', kind: 'async', to: 'store' })
        expect(session.getEdgeSnapshot(insertedId)?.sourceAttachment).toBeUndefined()
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: insertedId, objectKind: 'edge' }])
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
            session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
            placement.activate({
                defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
                kind: 'component',
            })
        })
        scroller.scrollLeft = 20
        scroller.scrollTop = 12
        const drawingSurface = screen.getByLabelText('New diagram')
        vi.spyOn(drawingSurface, 'getBoundingClientRect').mockReturnValue({bottom: 440, height: 400, left: 6, right: 806, toJSON: () => ({}), top: 40, width: 800, x: 6, y: 40})

        fireEvent.pointerMove(scroller, { clientX: 100, clientY: 80, isPrimary: true, pointerId: 8 })
        const preview = screen.getByText('New component').closest('button')
        expect(preview).toHaveStyle({ left: '100px', top: '44px' })
        expect(Math.abs(6 + 100 * session.getViewportScaleSnapshot() - 100)).toBeLessThanOrEqual(2)
        expect(Math.abs(40 + 44 * session.getViewportScaleSnapshot() - 80)).toBeLessThanOrEqual(2)
        expect(session.getNodeIdsSnapshot()).toEqual(['orders', 'store'])

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 8 })
        fireEvent.pointerUp(scroller, { clientX: 100, clientY: 80, pointerId: 8 })
        fireEvent.click(scroller)

        const nodeId = session.getNodeIdsSnapshot()[2]
        expect(session.getNodeSnapshot(nodeId)).toMatchObject({ kind: 'component', x: 100, y: 44 })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: nodeId, objectKind: 'node' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(screen.getByRole('button', { name: 'New component' })).not.toHaveAttribute('aria-disabled')
    })

    it('keeps Add preview at pointer when the New viewport scrolls', () => {
        const { geometry, placement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} placement={placement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const drawingSurface = screen.getByLabelText('New diagram')
        vi.spyOn(drawingSurface, 'getBoundingClientRect').mockImplementation(() => ({
            bottom: 428 - scroller.scrollTop, height: 400, left: 26 - scroller.scrollLeft,
            right: 826 - scroller.scrollLeft, toJSON: () => ({}), top: 28 - scroller.scrollTop,
            width: 800, x: 26 - scroller.scrollLeft, y: 28 - scroller.scrollTop,
        }))
        act(() => {
            session.setViewportScale(1.25)
            placement.activate({ defaults: { height: 72, label: 'New component', role: 'focal', width: 160 }, kind: 'component' })
        })

        fireEvent.pointerMove(scroller, { clientX: 100, clientY: 80, isPrimary: true, pointerId: 18 })
        expect(placement.getPreviewSnapshot()?.node).toMatchObject({ x: 60, y: 40 })

        scroller.scrollLeft = 25
        scroller.scrollTop = 20
        fireEvent.scroll(scroller)
        expect(placement.getPreviewSnapshot()?.node).toMatchObject({ x: 80, y: 56 })

        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 18 })
        fireEvent.pointerUp(scroller, { clientX: 100, clientY: 80, pointerId: 18 })
        const nodeId = session.getNodeIdsSnapshot().at(-1) as string
        expect(session.getNodeSnapshot(nodeId)).toMatchObject({ x: 80, y: 56 })
    })

    it('draws, labels, mounts, and selects one group through scrolled, zoomed New coordinates', async () => {
        const { geometry, groupDrawing, selection, session } = createHarness()
        const user = userEvent.setup()
        render(
            <DiagramZoomViewport
                geometry={geometry}
                groupDrawing={groupDrawing}
                selection={selection}
                session={session}
            />,
        )
        const scroller = screen.getByLabelText('New diagram scroller')
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({bottom: 420, height: 400, left: 10, right: 810, toJSON: () => ({}), top: 20, width: 800, x: 10, y: 20})
        scroller.scrollLeft = 40
        scroller.scrollTop = 20
        vi.spyOn(screen.getByLabelText('New diagram'), 'getBoundingClientRect').mockImplementation(() => ({bottom: 420 - scroller.scrollTop, height: 400, left: 10 - scroller.scrollLeft, right: 810 - scroller.scrollLeft, toJSON: () => ({}), top: 20 - scroller.scrollTop, width: 800, x: 10 - scroller.scrollLeft, y: 20 - scroller.scrollTop}))
        act(() => {
            session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
            groupDrawing.activate()
        })
        const scale = session.getViewportScaleSnapshot()
        const start = viewportClientPoint(100, 80, scale, scroller.scrollLeft, scroller.scrollTop)
        const end = viewportClientPoint(220, 180, scale, scroller.scrollLeft, scroller.scrollTop)

        fireEvent.pointerDown(scroller, { button: 0, ...start, isPrimary: true, pointerId: 31 })
        fireEvent.pointerMove(scroller, { ...end, pointerId: 31 })
        expect(screen.getByTestId('diagram-group-drawing-preview')).toHaveStyle({ height: '100px', left: '100px', top: '80px', width: '120px' })
        fireEvent.pointerUp(scroller, { ...end, pointerId: 31 })

        expect(session.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(screen.getByRole('dialog', { name: 'New group' })).toBeInTheDocument()
        await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Platform')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        const groupId = session.getGroupIdsSnapshot().at(-1) as string
        expect(session.getGroupSnapshot(groupId)).toEqual({height: 100, id: groupId, label: 'Platform', nodeIds: [], width: 120, x: 100, y: 80})
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: groupId, objectKind: 'group' }])
        await waitFor(() => expect(screen.getByRole('button', { name: 'Platform' })).toHaveAttribute('aria-pressed', 'true'))
        expect(screen.queryByTestId('diagram-group-drawing-preview')).not.toBeInTheDocument()
        expect(session.getActiveToolSnapshot()).toBe('select')
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
        expect(session.getActiveToolSnapshot()).toBe('node:component')
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

    it('lets Node details receive input while Add is active and keeps Cancel separate from Save', async () => {
        const { geometry, placement, selection, session } = createHarness()
        const details = new DiagramObjectDetailsService()
        const user = userEvent.setup()
        render(<DiagramZoomViewport details={details} geometry={geometry} placement={placement} selection={selection} session={session} />)
        act(() => {
            placement.activate({ defaults: { height: 72, label: 'New component', role: 'focal', width: 160 }, kind: 'component' })
            details.open({ objectId: 'orders', objectKind: 'node' })
        })

        const label = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(label)
        await user.type(label, 'Purchases')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Orders')
        expect(session.getActiveToolSnapshot()).toBe('node:component')

        act(() => { details.open({ objectId: 'orders', objectKind: 'node' }) })
        await user.clear(screen.getByRole('textbox', { name: 'Label' }))
        await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Purchases')
        await user.click(screen.getByRole('button', { name: 'Save' }))
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
        expect(details.getTargetSnapshot()).toBeNull()
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

        act(() => { session.setViewportScale(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP) })

        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({
            transformOrigin: 'top left',
            zoom: DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP,
        })
        expect(scroller.scrollLeft).toBe(110)
        expect(scroller.scrollTop).toBe(55)
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

        act(() => { session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP) })

        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({
            transformOrigin: 'top left',
            zoom: DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP,
        })
        expect(scroller.scrollLeft).toBe(90)
        expect(scroller.scrollTop).toBe(45)
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getEditableDiagram()?.nodes[0]).toMatchObject({ x: 240, y: 120 })
    })

    it('Ctrl-wheel zooms New without changing edit, selection, tool, or gesture state', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => { session.setActiveTool('pan') })
        const editableDiagram = session.getEditableDiagram()

        const wheelEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: -50 })

        expect(wheelEvent.defaultPrevented).toBe(true)
        expect(session.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP)
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(session.getDirtySnapshot()).toBe(false)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getActiveToolSnapshot()).toBe('pan')
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('keeps direct node selection working on transformed New content', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)

        act(() => { session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP) })
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
        act(() => { session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP) })
        const scale = session.getViewportScaleSnapshot()

        fireEvent.pointerDown(surface, { button: 0, clientX: 95, clientY: 67.5, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 245, clientY: 142.5, pointerId: 1 })

        const rectangle = screen.getByTestId('diagram-selection-rectangle')
        expect(rectangle).toHaveStyle({
            left: `${75 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)}px`,
            top: `${37.5 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)}px`,
        })
        expect(parseFloat(getComputedStyle(rectangle).height)).toBeCloseTo(75 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP))
        expect(parseFloat(getComputedStyle(rectangle).width)).toBeCloseTo(150 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP))
        expect(screen.getByTestId('new-diagram-zoom-surface')).toHaveStyle({ zoom: scale })

        scroller.scrollLeft = 80
        scroller.scrollTop = 60
        expect(screen.getByTestId('diagram-selection-rectangle')).toHaveStyle({
            left: `${75 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)}px`,
            top: `${37.5 / (DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)}px`,
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
            session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
            selection.replace([
                { objectId: 'orders', objectKind: 'node' },
                { objectId: 'store', objectKind: 'node' },
            ])
        })

        fireEvent.pointerDown(orders, { button: 0, clientX: 110, clientY: 70, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 134, clientY: 94, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })
        fireEvent.click(orders)

        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 264, y: 144 })
        expect(session.getNodeSnapshot('store')).toMatchObject({ x: 504, y: 144 })
        expect(selection.getSelectionSnapshot()).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
        ])
    })

    it.each([DEFAULT_DIAGRAM_ZOOM, DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP])('moves a node by touch at zoom %s and rolls back cancellation', (scale) => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const node = screen.getByRole('button', { name: 'Orders' })
        const capturePointer = vi.fn()
        scroller.setPointerCapture = capturePointer
        expect(getComputedStyle(node).touchAction).toBe('none')
        act(() => { session.setViewportScale(scale) })

        fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 31, pointerType: 'touch' })
        expect(capturePointer).toHaveBeenCalledWith(31)
        fireEvent.pointerMove(scroller, { clientX: 124, clientY: 104, pointerId: 31, pointerType: 'touch' })
        expect(movement.getMoveActiveSnapshot()).toBe(true)
        expect(session.getNodeFieldSnapshot('orders', 'x')).not.toBe(240)
        fireEvent.pointerCancel(scroller, { pointerId: 31, pointerType: 'touch' })
        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 240, y: 120 })

        fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 80, isPrimary: true, pointerId: 32, pointerType: 'touch' })
        fireEvent.pointerMove(scroller, { clientX: 124, clientY: 104, pointerId: 32, pointerType: 'touch' })
        fireEvent.pointerUp(scroller, { pointerId: 32, pointerType: 'touch' })
        expect(session.getNodeFieldSnapshot('orders', 'x')).not.toBe(240)
        expect(movement.getMoveActiveSnapshot()).toBe(false)
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
            session.setViewportScale(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
            selection.replace([{ objectId: 'orders', objectKind: 'node' }])
        })
        const handle = screen.getByRole('button', { name: 'Resize Orders south-east' })

        fireEvent.pointerDown(handle, { button: 0, clientX: 110, clientY: 70, isPrimary: true, pointerId: 6 })
        fireEvent.pointerMove(scroller, { clientX: 122, clientY: 78, pointerId: 6 })
        fireEvent.pointerUp(scroller, { pointerId: 6 })

        expect(session.getNodeSnapshot('orders')).toMatchObject({ height: 80, width: 172, x: 240, y: 120 })
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

    it('pans New with the pointer while the pan tool is active and leaves diagram data untouched', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        scroller.scrollLeft = 120
        scroller.scrollTop = 80
        act(() => { session.setActiveTool('pan') })
        const ordersBefore = session.getNodeSnapshot('orders')

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        expect(session.getTransientGestureSnapshot()).toBe('pan')

        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 170, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })

        expect(scroller.scrollLeft).toBe(160)
        expect(scroller.scrollTop).toBe(110)
        expect(session.getTransientGestureSnapshot()).toBeNull()
        expect(session.getActiveToolSnapshot()).toBe('pan')
        expect(session.getNodeSnapshot('orders')).toEqual(ordersBefore)
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(session.getDirtySnapshot()).toBe(false)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
    })

    it('pans by the same viewport pixels at every zoom scale and starts no move on a node', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const orders = screen.getByRole('button', { name: 'Orders' })
        act(() => { session.setActiveTool('pan') })
        act(() => { session.setViewportScale(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP) })
        scroller.scrollLeft = 120
        scroller.scrollTop = 80
        const ordersBefore = session.getNodeSnapshot('orders')

        fireEvent.pointerDown(orders, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 170, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })

        expect(scroller.scrollLeft).toBe(160)
        expect(scroller.scrollTop).toBe(110)
        expect(session.getNodeSnapshot('orders')).toEqual(ordersBefore)
    })

    it('restores the scroll position when Escape or a cancelled pointer ends a pan', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => { session.setActiveTool('pan') })
        scroller.scrollLeft = 120
        scroller.scrollTop = 80

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 200, clientY: 100, pointerId: 1 })
        fireEvent.keyDown(window, { key: 'Escape' })

        expect(scroller.scrollLeft).toBe(120)
        expect(scroller.scrollTop).toBe(80)
        expect(session.getTransientGestureSnapshot()).toBeNull()

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 2 })
        fireEvent.pointerMove(scroller, { clientX: 200, clientY: 100, pointerId: 2 })
        fireEvent.pointerCancel(scroller, { pointerId: 2 })

        expect(scroller.scrollLeft).toBe(120)
        expect(scroller.scrollTop).toBe(80)
    })

    it('restores the scroll position when another tool replaces the running pan', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => { session.setActiveTool('pan') })
        scroller.scrollLeft = 120
        scroller.scrollTop = 80

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 200, clientY: 100, pointerId: 1 })
        act(() => { session.cancelActiveInteraction() })

        expect(scroller.scrollLeft).toBe(120)
        expect(scroller.scrollTop).toBe(80)
        expect(session.getActiveToolSnapshot()).toBe('pan')
    })

    it('selects nothing on the click that follows a New pan past the drag threshold', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        act(() => { session.setActiveTool('pan') })

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 200, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }))

        expect(selection.getSelectionSnapshot()).toEqual([])
    })

    it('keeps rectangle selection when the trailing click lands on a node', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const surface = screen.getByLabelText('New diagram')

        fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 800, clientY: 400, pointerId: 1 })
        fireEvent.pointerUp(surface, { clientX: 800, clientY: 400, pointerId: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }))

        expect(selection.getSelectionSnapshot()).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
            { objectId: 'orders-store', objectKind: 'edge' },
            { objectId: 'backend', objectKind: 'group' },
        ])
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('cancels a touch rectangle when a second finger starts a pinch', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const surface = screen.getByLabelText('New diagram')
        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })
        const previousSelection = selection.getSelectionSnapshot()

        fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0, isPrimary: true, pointerId: 1, pointerType: 'touch' })
        fireEvent.pointerMove(surface, { clientX: 30, clientY: 30, pointerId: 1, pointerType: 'touch' })
        expect(selection.getRectangleSnapshot()).not.toBeNull()
        fireEvent.pointerDown(scroller, { button: 0, clientX: 100, clientY: 0, isPrimary: false, pointerId: 2, pointerType: 'touch' })
        expect(selection.getRectangleSnapshot()).toBeNull()
        fireEvent.pointerMove(scroller, { clientX: 150, clientY: 0, pointerId: 2, pointerType: 'touch' })
        expect(session.getViewportScaleSnapshot()).toBeGreaterThan(1)
        fireEvent.pointerUp(scroller, { pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerUp(scroller, { pointerId: 1, pointerType: 'touch' })

        expect(selection.getSelectionSnapshot()).toBe(previousSelection)
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('cancels touch movement before pinch zoom changes New viewport scale', () => {
        const { geometry, movement, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} movement={movement} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        const node = screen.getByRole('button', { name: 'Orders' })

        fireEvent.pointerDown(node, { button: 0, clientX: 250, clientY: 130, isPrimary: true, pointerId: 1, pointerType: 'touch' })
        fireEvent.pointerMove(scroller, { clientX: 280, clientY: 160, pointerId: 1, pointerType: 'touch' })
        fireEvent.pointerDown(scroller, { button: 0, clientX: 350, clientY: 130, isPrimary: false, pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerMove(scroller, { clientX: 400, clientY: 130, pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerCancel(scroller, { pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerUp(scroller, { pointerId: 1, pointerType: 'touch' })

        expect(session.getViewportScaleSnapshot()).toBeGreaterThan(1)
        expect(session.getNodeSnapshot('orders')).toMatchObject({ x: 240, y: 120 })
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('keeps the touched diagram point under the moving midpoint while New pinch zooms', () => {
        const { geometry, selection, session } = createHarness()
        render(<DiagramZoomViewport geometry={geometry} selection={selection} session={session} />)
        const scroller = screen.getByLabelText('New diagram scroller')
        scroller.scrollLeft = 120
        scroller.scrollTop = 80
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ bottom: 420, height: 400, left: 10, right: 410, toJSON: () => ({}), top: 20, width: 400, x: 10, y: 20 })

        fireEvent.pointerDown(scroller, { button: 0, clientX: 110, clientY: 120, isPrimary: true, pointerId: 1, pointerType: 'touch' })
        fireEvent.pointerDown(scroller, { button: 0, clientX: 210, clientY: 120, isPrimary: false, pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 120, pointerId: 2, pointerType: 'touch' })

        expect(session.getViewportScaleSnapshot()).toBeCloseTo(1.5)
        expect(scroller.scrollLeft).toBeCloseTo(230)
        expect(scroller.scrollTop).toBeCloseTo(170)
        expect(session.getDirtySnapshot()).toBe(false)
        fireEvent.pointerUp(scroller, { pointerId: 2, pointerType: 'touch' })
        fireEvent.pointerUp(scroller, { pointerId: 1, pointerType: 'touch' })
    })
})
