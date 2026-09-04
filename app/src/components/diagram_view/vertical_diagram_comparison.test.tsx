import {
    act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { layout } from '../../services/diagrams/diagram_layout'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'
import { VerticalDiagramComparison } from './vertical_diagram_comparison'

const COMPARISON_WIDTH = 806

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

    return { geometry: new DiagramGeometryService(session), session }
}

beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        bottom: 600,
        height: 600,
        left: 0,
        right: COMPARISON_WIDTH,
        toJSON: () => ({}),
        top: 0,
        width: COMPARISON_WIDTH,
        x: 0,
        y: 0,
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('VerticalDiagramComparison', () => {
    it('places Current left of New and lets both panes scroll independently', () => {
        const { geometry, session } = createHarness()
        render(
            <VerticalDiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={new DiagramComparisonLayoutService()}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const comparison = screen.getByLabelText('Vertical diagram comparison')
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        const separator = screen.getByRole('separator', { name: 'Resize Current and New diagrams horizontally' })

        expect(current.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(separator.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(separator).toHaveAttribute('aria-orientation', 'vertical')
        expect(comparison).toHaveStyle({ minWidth: '486px' })
        expect(current).toHaveStyle({ overflow: 'auto' })
        expect(next).toHaveStyle({ overflow: 'auto' })
    })

    it('keeps diagram edits isolated from Current and comparison pane roots', () => {
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const currentDiagram = layout(diagram)
        const onCurrentSelect = vi.fn()
        render(
            <VerticalDiagramComparison
                currentDiagram={currentDiagram}
                geometry={geometry}
                layoutService={layoutService}
                onCurrentSelect={onCurrentSelect}
                session={session}
            />,
        )
        const comparison = screen.getByLabelText('Vertical diagram comparison')
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        const currentMarkup = current.innerHTML

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(screen.getByLabelText('Vertical diagram comparison')).toBe(comparison)
        expect(screen.getByRole('region', { name: 'Current' })).toBe(current)
        expect(screen.getByRole('region', { name: 'New' })).toBe(next)
        expect(current.innerHTML).toBe(currentMarkup)
        expect(within(current).getByRole('button', { name: 'Orders' })).toBeInTheDocument()
        expect(within(next).getByRole('button', { name: 'Order intake' })).toBeInTheDocument()
    })

    it('resizes by pointer within minimum widths without changing geometry, selection, or edits', () => {
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const onCurrentSelect = vi.fn()
        render(
            <VerticalDiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={layoutService}
                onCurrentSelect={onCurrentSelect}
                session={session}
            />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize Current and New diagrams horizontally' })
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })
        fireEvent.click(within(current).getByRole('button', { name: 'Orders' }))
        act(() => { session.setNodeField('orders', 'label', 'Order intake') })
        const geometryBefore = {
            height: geometry.getSurfaceFieldSnapshot('height'),
            width: geometry.getSurfaceFieldSnapshot('width'),
        }
        const changeIdsBefore = session.getChangeIdsSnapshot()

        fireEvent.pointerDown(separator, { pointerId: 1 })
        fireEvent.pointerMove(separator, { clientX: 20, pointerId: 1 })

        expect(separator).toHaveAttribute('aria-valuenow', '30')
        expect(screen.getByRole('region', { name: 'Current' })).toBe(current)
        expect(screen.getByRole('region', { name: 'New' })).toBe(next)

        fireEvent.pointerMove(separator, { clientX: 1000, pointerId: 1 })
        fireEvent.pointerUp(separator, { pointerId: 1 })

        expect(separator).toHaveAttribute('aria-valuenow', '70')
        expect(onCurrentSelect).toHaveBeenCalledTimes(1)
        expect(session.getChangeIdsSnapshot()).toBe(changeIdsBefore)
        expect(session.getDirtySnapshot()).toBe(true)
        expect(within(next).getByRole('button', { name: 'Order intake' })).toBeInTheDocument()
        expect({
            height: geometry.getSurfaceFieldSnapshot('height'),
            width: geometry.getSurfaceFieldSnapshot('width'),
        }).toEqual(geometryBefore)
    })

    it('resizes with keyboard controls and clamps Home and End', () => {
        const { geometry, session } = createHarness()
        render(
            <VerticalDiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={new DiagramComparisonLayoutService()}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize Current and New diagrams horizontally' })

        fireEvent.keyDown(separator, { key: 'ArrowLeft' })
        expect(separator).toHaveAttribute('aria-valuenow', '47')

        fireEvent.keyDown(separator, { key: 'Home' })
        expect(separator).toHaveAttribute('aria-valuenow', '30')

        fireEvent.keyDown(separator, { key: 'End' })
        expect(separator).toHaveAttribute('aria-valuenow', '70')
    })
})
