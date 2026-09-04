import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
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

    return { geometry: new DiagramGeometryService(session), session }
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

    it('keeps pointer selection on transformed diagram nodes accurate', () => {
        const { geometry, session } = createHarness()
        const onSelect = vi.fn()
        render(<DiagramZoomViewport geometry={geometry} onSelect={onSelect} session={session} />)

        act(() => { session.zoomOut() })
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }), { clientX: 190, clientY: 120 })

        expect(onSelect).toHaveBeenCalledWith({ id: 'orders', label: 'Orders', left: 190, top: 120 })
    })
})
