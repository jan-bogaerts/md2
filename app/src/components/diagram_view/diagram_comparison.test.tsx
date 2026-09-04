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

    return { geometry: new DiagramGeometryService(session), session }
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

    it('places Current above New and lets each pane scroll independently', () => {
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
        expect(next).toHaveStyle({ overflow: 'auto' })
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
})
