import {
    act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { layout } from '../../services/diagrams/diagram_layout'
import { DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramComparison } from './diagram_comparison'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'

const COMPARISON_HEIGHT = 806

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [],
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
    const selection = new DiagramSelectionService(session)

    return { geometry, movement: new DiagramMoveService(session, geometry, selection), selection, session }
}

beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        bottom: COMPARISON_HEIGHT,
        height: COMPARISON_HEIGHT,
        left: 0,
        right: 800,
        toJSON: () => ({}),
        top: 0,
        width: 800,
        x: 0,
        y: 0,
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('DiagramComparison', () => {
    it('labels Current and New and updates only New after an accepted edit', () => {
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const onCurrentSelect = vi.fn()
        let comparisonRenders = 0
        const Comparison = () => {
            comparisonRenders += 1

            return (
                <DiagramComparison
                    currentDiagram={layout(diagram)}
                    geometry={geometry}
                    layoutService={layoutService}
                    onCurrentSelect={onCurrentSelect}
                    session={session}
                />
            )
        }
        render(<Comparison />)
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        const currentMarkup = current.innerHTML

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(within(current).getByRole('button', { name: 'Orders' })).toBeTruthy()
        expect(within(next).getByRole('button', { name: 'Order intake' })).toBeTruthy()
        expect(current.innerHTML).toBe(currentMarkup)
        expect(comparisonRenders).toBe(1)
    })

    it('places Current above New and keeps diagram scrolling behind the New toolbox', () => {
        const { geometry, session } = createHarness()
        render(
            <DiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={new DiagramComparisonLayoutService()}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })

        expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(current).toHaveStyle({ overflow: 'auto' })
        expect(next).toHaveStyle({ overflow: 'hidden', position: 'relative' })
        expect(within(next).getByLabelText('New diagram scroller')).toHaveStyle({ overflow: 'auto' })
        expect(screen.getByRole('dialog', { name: 'Diagram tools' })).toBeInTheDocument()
    })

    it('resizes by pointer while preserving minimum pane heights and diagram state', () => {
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        render(
            <DiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={layoutService}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize Current and New diagrams' })
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        const geometryBefore = {
            height: geometry.getSurfaceFieldSnapshot('height'),
            width: geometry.getSurfaceFieldSnapshot('width'),
        }
        const changeIdsBefore = session.getChangeIdsSnapshot()

        fireEvent.pointerDown(separator, { pointerId: 1 })
        fireEvent.pointerMove(separator, { clientY: 20, pointerId: 1 })

        expect(separator).toHaveAttribute('aria-valuenow', '20')
        expect(screen.getByRole('region', { name: 'Current' })).toBe(current)
        expect(screen.getByRole('region', { name: 'New' })).toBe(next)

        fireEvent.pointerMove(separator, { clientY: 1000, pointerId: 1 })
        fireEvent.pointerUp(separator, { pointerId: 1 })

        expect(separator).toHaveAttribute('aria-valuenow', '80')
        expect(session.getChangeIdsSnapshot()).toBe(changeIdsBefore)
        expect(session.getDirtySnapshot()).toBe(false)
        expect({
            height: geometry.getSurfaceFieldSnapshot('height'),
            width: geometry.getSurfaceFieldSnapshot('width'),
        }).toEqual(geometryBefore)
    })

    it('resizes with keyboard controls and clamps Home and End', () => {
        const { geometry, session } = createHarness()
        render(
            <DiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={new DiagramComparisonLayoutService()}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize Current and New diagrams' })

        fireEvent.keyDown(separator, { key: 'ArrowUp' })
        expect(separator).toHaveAttribute('aria-valuenow', '47')

        fireEvent.keyDown(separator, { key: 'Home' })
        expect(separator).toHaveAttribute('aria-valuenow', '20')

        fireEvent.keyDown(separator, { key: 'End' })
        expect(separator).toHaveAttribute('aria-valuenow', '80')
    })

    it('keeps comparison root, Current, toolbox, and unmoved node isolated during a New drag', () => {
        const { geometry, movement, selection, session } = createHarness()
        let comparisonRenders = 0
        const Comparison = () => {
            comparisonRenders += 1

            return (
                <DiagramComparison
                    currentDiagram={layout(diagram)}
                    geometry={geometry}
                    movement={movement}
                    onCurrentSelect={vi.fn()}
                    selection={selection}
                    session={session}
                />
            )
        }
        render(<Comparison />)
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        const scroller = within(next).getByLabelText('New diagram scroller')
        const orders = within(next).getByRole('button', { name: 'Orders' })
        const store = within(next).getByRole('button', { name: 'Store' })
        const currentMarkup = current.innerHTML
        const storeStyle = store.getAttribute('style')
        const toolbox = screen.getByRole('dialog', { name: 'Diagram tools' })
        const startX = geometry.getNodeGeometryFieldSnapshot('orders', 'x')

        fireEvent.pointerDown(orders, { button: 0, clientX: 100, clientY: 100, isPrimary: true, pointerId: 4 })
        fireEvent.pointerMove(scroller, { clientX: 116, clientY: 100, pointerId: 4 })
        fireEvent.pointerUp(scroller, { pointerId: 4 })

        expect(session.getNodeSnapshot('orders')?.x).toBe((startX ?? 0) + 16)
        expect(store.getAttribute('style')).toBe(storeStyle)
        expect(current.innerHTML).toBe(currentMarkup)
        expect(screen.getByRole('dialog', { name: 'Diagram tools' })).toBe(toolbox)
        expect(comparisonRenders).toBe(1)
    })
})
