import { cleanup, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramData, type DiagramData } from '../../services/diagrams/diagram_data'
import { generateDiagramChangeDescriptions } from '../../services/diagrams/diagram_change_descriptions'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { DiagramChangeReviewService } from './diagram_change_review_service'
import { DiagramComparison } from './diagram_comparison'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

const diagrams: Record<string, DiagramData> = {
    architecture: {
        edges: [{ from: 'one', id: 'one-two', kind: 'connection', label: 'calls', to: 'two' }],
        groups: [{ id: 'scope', label: 'Scope', nodeIds: ['one', 'two'] }],
        meta: { description: 'Architecture', title: 'Architecture', type: 'architecture', version: 1 },
        nodes: [{ id: 'one', label: 'One', role: 'focal' }, { id: 'two', label: 'Two', role: 'backend' }],
    },
    dependency: {
        edges: [{ from: 'one', id: 'one-two', kind: 'dependency', label: 'uses', to: 'two' }],
        groups: [],
        meta: { description: 'Dependencies', title: 'Dependencies', type: 'dependency', version: 1 },
        nodes: [{ id: 'one', label: 'One', role: 'focal' }, { id: 'two', label: 'Two', role: 'backend' }],
    },
    entity: {
        edges: [{ from: 'one', fromCardinality: '1', id: 'one-two', kind: 'relationship', to: 'two', toCardinality: 'N' }],
        groups: [],
        meta: { description: 'Entities', title: 'Entities', type: 'entity', version: 1 },
        nodes: [
            { fields: [{ key: 'primary', name: 'id', type: 'uuid' }], id: 'one', kind: 'entity', label: 'One', role: 'focal' },
            { fields: [], id: 'two', kind: 'entity', label: 'Two', role: 'store' },
        ],
    },
    flowchart: {
        edges: [{ from: 'one', id: 'one-two', kind: 'flow', label: 'yes', to: 'two' }],
        groups: [],
        meta: { description: 'Flowchart', preset: 'flowchart', title: 'Flowchart', type: 'flow', version: 1 },
        nodes: [
            { id: 'one', kind: 'decision', label: 'One', role: 'focal' },
            { id: 'two', kind: 'end', label: 'Two', role: 'backend' },
        ],
    },
    sequence: {
        edges: [{ from: 'one', id: 'one-two', kind: 'call', label: 'calls', to: 'two' }],
        fragments: [{ id: 'optional-call', operator: 'opt', regions: [{ edgeIds: ['one-two'], guard: 'needed' }] }],
        groups: [],
        meta: { description: 'Sequence', title: 'Sequence', type: 'sequence', version: 1 },
        nodes: [
            { id: 'one', kind: 'participant', label: 'One', role: 'focal' },
            { id: 'two', kind: 'participant', label: 'Two', role: 'backend' },
        ],
    },
    state: {
        edges: [{ from: 'one', id: 'one-two', kind: 'transition', label: 'advance', to: 'two' }],
        groups: [],
        meta: { description: 'State flow', preset: 'state', title: 'State flow', type: 'flow', version: 1 },
        nodes: [
            { id: 'one', kind: 'state', label: 'One', role: 'focal' },
            { id: 'two', kind: 'state', label: 'Two', role: 'backend' },
        ],
    },
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(diagram: DiagramData) {
        super()
        this.source = { diagram, record }
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createSession(diagram: DiagramData) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(diagram))
    session.bindProject(project)
    session.start()

    return session
}

afterEach(cleanup)

describe('diagram editor integration', () => {
    it.each([
        ['architecture', (session: DiagramEditSessionService) => session.setNodeField('one', 'label', 'One edited'), 'One', 'One edited'],
        ['dependency', (session: DiagramEditSessionService) => session.setEdgeField('one-two', 'label', 'depends on'), 'uses', 'depends on'],
        ['sequence', (session: DiagramEditSessionService) => session.setFragmentField('optional-call', 'operator', 'loop'), 'opt', 'loop'],
        ['flowchart', (session: DiagramEditSessionService) => session.setEdgeField('one-two', 'label', 'approved'), 'yes', 'approved'],
        ['state', (session: DiagramEditSessionService) => session.setEdgeField('one-two', 'label', 'complete'), 'advance', 'complete'],
        ['entity', (session: DiagramEditSessionService) => session.setEntityField('one', 0, 'name', 'entityId'), '# id: uuid', '# entityId: uuid'],
    ] as const)('keeps Current immutable and New valid through %s edits', (diagramName, mutate, currentText, newText) => {
        const diagram = diagrams[diagramName]
        const originalText = JSON.stringify(diagram)
        const session = createSession(diagram)
        const geometry = new DiagramGeometryService(session)
        render(
            <DiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const current = screen.getByRole('region', { name: 'Current' })
        const next = screen.getByRole('region', { name: 'New' })

        act(() => { expect(mutate(session)).toBe(true) })

        expect(within(current).getByText(currentText)).toBeInTheDocument()
        expect(within(next).getByText(newText)).toBeInTheDocument()
        expect(JSON.stringify(diagram)).toBe(originalText)
        expect(parseDiagramData(JSON.stringify(session.getEditableDiagram()))).toEqual(session.getEditableDiagram())
    })

    it('hands off exact reviewed text from current session and rejects later stale reuse', () => {
        const session = createSession(diagrams.architecture)
        const review = new DiagramChangeReviewService(
            session,
            { replace: vi.fn() },
            generateDiagramChangeDescriptions,
            parseDiagramData,
            () => 'review-1',
            () => () => undefined,
        )
        session.setNodeField('one', 'label', 'One edited')
        review.open()
        const reviewedText = review.getGeneratedTextSnapshot()

        expect(review.requestAgentHandoff()).toBe(true)
        const context = review.getAgentHandoffContextSnapshot()
        expect(context?.diagramChanges).toBe(reviewedText)
        expect(context?.diagramId).toBe(record.id)

        session.setNodeField('two', 'label', 'Two edited')

        expect(review.getAgentHandoffContextSnapshot()).toBe(context)
        expect(review.requestAgentHandoff()).toBe(false)
        expect(review.getBlockingItemsSnapshot()).toContain(
            'Diagram changes changed after review. Review them again before sending to an agent.',
        )
    })
})
