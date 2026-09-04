import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramZoomViewport } from './diagram_zoom_viewport'

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [{ id: 'orders', label: 'Orders', role: 'focal', x: 240, y: 120 }],
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

    return { geometry, selection: new DiagramSelectionService(session, geometry), session }
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
})
