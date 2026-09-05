import { describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramNodeKind } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramNodePlacementService } from './diagram_node_placement_service'
import { DiagramSelectionService } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'diagram.json' }

class DiagramSourceStub extends EventTarget {
    private readonly diagram: DiagramData

    constructor(diagramData: DiagramData) {
        super()
        this.diagram = diagramData
    }

    getSourceSnapshot = (): DiagramViewSourceSnapshot => ({ diagram: this.diagram, record })

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

const geometryStub = {
    getEdgeRouteSnapshot: () => [],
    getGroupGeometryFieldSnapshot: () => null,
    getNodeGeometryFieldSnapshot: () => null,
}

function diagram(type: DiagramData['meta']['type'], preset?: DiagramData['meta']['preset']): DiagramData {
    const edgeKind = type === 'dependency' ? 'dependency' : type === 'entity' ? 'relationship' : 'connection'

    return {
        edges: [{ from: 'existing', id: 'existing-edge', kind: edgeKind, to: 'other' }],
        groups: [],
        meta: { description: 'Placement test', ...(preset ? { preset } : {}), title: 'Placement', type, version: 1 },
        nodes: [
            { id: 'existing', label: 'Existing', role: 'focal', ...(type === 'flow' ? { kind: 'step' as const } : {}) },
            { id: 'other', label: 'Other', role: 'backend', ...(type === 'flow' ? { kind: 'step' as const } : {}) },
        ],
    }
}

function createHarness(source = diagram('architecture')) {
    const createId = vi.fn()
        .mockReturnValueOnce('existing')
        .mockReturnValueOnce('existing-edge')
        .mockReturnValueOnce('placed-node')
    const session = new DiagramEditSessionService(new DiagramSourceStub(source), createId, vi.fn())
    const selection = new DiagramSelectionService(session, geometryStub)
    const placement = new DiagramNodePlacementService(session, selection)
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return { createId, placement, selection, session }
}

const stepDefinition = {
    defaults: { height: 72, label: 'New step', role: 'focal' as const, width: 160 },
    kind: 'step' as const,
}

const componentDefinition = {
    defaults: { height: 72, label: 'New component', role: 'focal' as const, width: 160 },
    kind: 'component' as const,
}

const flowchartStartDefinition = {
    defaults: { height: 48, label: 'Start', role: 'focal' as const, width: 120 },
    kind: 'start' as const,
}

const stateStartDefinition = {
    defaults: { height: 24, label: 'Start', role: 'focal' as const, width: 24 },
    kind: 'start' as const,
}

const participantDefinition = {
    defaults: { height: 72, label: 'New participant', role: 'focal' as const, width: 160 },
    kind: 'participant' as const,
}

const decisionDefinition = {
    defaults: { height: 96, label: 'New decision', role: 'focal' as const, width: 96 },
    kind: 'decision' as const,
}

describe('DiagramNodePlacementService', () => {
    it.each(['architecture', 'dependency'] as const)(
        'previews on the grid, then creates and selects one component in a %s diagram through one membership mutation',
        (diagramType) => {
            const { createId, placement, selection, session } = createHarness(diagram(diagramType))
            const originalNodes = session.getEditableDiagram()?.nodes
            const originalNode = session.getNodeSnapshot('existing')
            const originalNodeIds = session.getNodeIdsSnapshot()
            const membershipChanged = vi.fn()
            const previewChanged = vi.fn()
            session.subscribeCollectionMembership('node', membershipChanged)
            placement.subscribePreview(previewChanged)

            expect(placement.activate(componentDefinition)).toBe(true)
            expect(placement.updatePreview({ x: 13, y: 18 })).toBe(true)

            expect(placement.getPreviewSnapshot()?.node).toMatchObject({ height: 72, kind: 'component', width: 160, x: 12, y: 20 })
            expect(session.getEditableDiagram()?.nodes).toBe(originalNodes)
            expect(session.getNodeIdsSnapshot()).toBe(originalNodeIds)
            expect(membershipChanged).not.toHaveBeenCalled()
            expect(session.getTransientGestureSnapshot()).toBe('placement')

            expect(placement.place({ x: 13, y: 18 })).toBe('placed-node')

            expect(createId).toHaveBeenCalledTimes(3)
            expect(session.getNodeSnapshot('existing')).toBe(originalNode)
            expect(session.getNodeIdsSnapshot()).toEqual(['existing', 'other', 'placed-node'])
            expect(session.getNodeFieldSnapshot('placed-node', 'x')).toBe(12)
            expect(session.getNodeFieldSnapshot('placed-node', 'y')).toBe(20)
            expect(membershipChanged).toHaveBeenCalledOnce()
            expect(session.getChangeIdsSnapshot()).toHaveLength(1)
            expect(session.getChange(session.getChangeIdsSnapshot()[0])).toMatchObject({category: 'collection', objectId: 'placed-node', objectKind: 'node', value: expect.objectContaining({ id: 'placed-node' })})
            expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
            expect(placement.getPreviewSnapshot()).toBeNull()
            expect(session.getTransientGestureSnapshot()).toBeNull()
            expect(session.getActiveToolSnapshot()).toBe('select')
            expect(previewChanged).toHaveBeenCalledTimes(2)
        },
    )

    it('places one valid sequence participant without replacing existing sequence objects', () => {
        const source = diagram('sequence')
        source.edges = [{ from: 'existing', id: 'existing-edge', kind: 'call', to: 'other' }]
        source.fragments = [{ id: 'existing-fragment', operator: 'opt', regions: [{ edgeIds: ['existing-edge'], guard: 'sent' }] }]
        source.nodes = source.nodes.map((node, index) => ({...node, height: 72, kind: 'participant', width: 160, x: 40 + index * 216, y: 40}))
        const { placement, selection, session } = createHarness(source)
        const editableDiagram = session.getEditableDiagram()
        const nodes = editableDiagram?.nodes
        const existingNode = session.getNodeSnapshot('existing')
        const otherNode = session.getNodeSnapshot('other')
        const edges = editableDiagram?.edges
        const existingEdge = session.getEdgeSnapshot('existing-edge')
        const fragments = editableDiagram?.fragments
        const existingFragment = session.getFragmentSnapshot('existing-fragment')

        expect(placement.activate(participantDefinition)).toBe(true)
        expect(placement.place({ x: 503, y: 43 })).toBe('placed-node')

        expect(session.getNodeSnapshot('placed-node')).toEqual({
            height: 72,
            id: 'placed-node',
            kind: 'participant',
            label: 'New participant',
            role: 'focal',
            width: 160,
            x: 504,
            y: 44,
        })
        expect(session.getEditableDiagram()?.nodes).toBe(nodes)
        expect(session.getNodeSnapshot('existing')).toBe(existingNode)
        expect(session.getNodeSnapshot('other')).toBe(otherNode)
        expect(session.getEditableDiagram()?.edges).toBe(edges)
        expect(session.getEdgeSnapshot('existing-edge')).toBe(existingEdge)
        expect(session.getEditableDiagram()?.fragments).toBe(fragments)
        expect(session.getFragmentSnapshot('existing-fragment')).toBe(existingFragment)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
    })

    it('creates and selects one step in a flowchart diagram through one membership mutation', () => {
        const source = diagram('flow', 'flowchart')
        source.edges = [{ from: 'existing', id: 'existing-edge', kind: 'flow', label: 'next', to: 'other' }]
        const { placement, selection, session } = createHarness(source)
        const originalNode = session.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(stepDefinition)).toBe(true)

        expect(placement.place({ x: 13, y: 18 })).toBe('placed-node')

        expect(session.getNodeSnapshot('existing')).toBe(originalNode)
        expect(session.getNodeIdsSnapshot()).toEqual(['existing', 'other', 'placed-node'])
        expect(session.getNodeFieldSnapshot('placed-node', 'kind')).toBe('step')
        expect(session.getNodeFieldSnapshot('placed-node', 'label')).toBe('New step')
        expect(session.getNodeFieldSnapshot('placed-node', 'x')).toBe(12)
        expect(session.getNodeFieldSnapshot('placed-node', 'y')).toBe(20)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.getChangeIdsSnapshot()).toHaveLength(1)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
    })

    it('creates one valid decision with rectangular geometry and keeps branch-label validation active', () => {
        const { placement, selection, session } = createHarness(diagram('flow', 'flowchart'))
        const originalNode = session.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(decisionDefinition)).toBe(true)
        expect(placement.place({ x: 41, y: 58 })).toBe('placed-node')

        expect(session.getNodeSnapshot('placed-node')).toEqual({
            height: 96,
            id: 'placed-node',
            kind: 'decision',
            label: 'New decision',
            role: 'focal',
            width: 96,
            x: 40,
            y: 60,
        })
        expect(session.getNodeSnapshot('existing')).toBe(originalNode)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.createEdge({ from: 'placed-node', kind: 'flow', to: 'existing' })).toBeNull()
        expect(session.getEdgeIdsSnapshot()).toEqual(['existing-edge'])
    })

    it.each([
        ['flowchart', flowchartStartDefinition, { height: 48, width: 120 }],
        ['state', stateStartDefinition, { height: 24, width: 24 }],
    ] as const)('places one schema-complete start node in a %s diagram', (preset, definition, size) => {
        const source = diagram('flow', preset)
        source.edges = [{ from: 'existing', id: 'existing-edge', kind: preset === 'state' ? 'transition' : 'flow', label: 'next', to: 'other' }]
        source.nodes = source.nodes.map((node) => ({ ...node, kind: preset === 'state' ? 'state' : 'step' }))
        const { placement, selection, session } = createHarness(source)
        const originalNode = session.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(definition)).toBe(true)

        expect(placement.place({ x: 13, y: 18 })).toBe('placed-node')

        expect(session.getNodeSnapshot('placed-node')).toEqual({
            height: size.height,
            id: 'placed-node',
            kind: 'start',
            label: 'Start',
            role: 'focal',
            width: size.width,
            x: 12,
            y: 20,
        })
        expect(session.getNodeSnapshot('existing')).toBe(originalNode)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.getChangeIdsSnapshot()).toHaveLength(1)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
    })

    it.each([
        ['architecture', undefined, 'component', true],
        ['flow', 'flowchart', 'step', true],
        ['architecture', undefined, 'participant', false],
        ['sequence', undefined, 'participant', true],
        ['entity', undefined, 'entity', true],
        ['flow', 'flowchart', 'decision', true],
        ['flow', 'flowchart', 'state', false],
        ['flow', 'state', 'state', true],
        ['flow', 'state', 'step', false],
        ['flow', 'flowchart', 'start', true],
        ['flow', 'state', 'start', true],
    ] as const)('reports %s/%s kind %s availability as %s', (type, preset, kind, available) => {
        const source = diagram(type, preset)
        if (type === 'sequence') source.edges = [{ from: 'existing', id: 'existing-edge', kind: 'call', to: 'other' }]
        if (type === 'flow') {
            source.edges = [{ from: 'existing', id: 'existing-edge', kind: preset === 'state' ? 'transition' : 'flow', label: 'next', to: 'other' }]
            source.nodes = source.nodes.map((node) => ({ ...node, kind: preset === 'state' ? 'state' : 'step' }))
        }
        const { placement } = createHarness(source)

        expect(placement.isNodeKindAvailable(kind as DiagramNodeKind)).toBe(available)
    })

    it('cancels preview without creating a node and returns to Select', () => {
        const { placement, session } = createHarness()
        const nodeIds = session.getNodeIdsSnapshot()
        placement.activate(componentDefinition)
        placement.updatePreview({ x: 32, y: 40 })

        expect(placement.cancelPlacement()).toBe(true)

        expect(session.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(placement.getPreviewSnapshot()).toBeNull()
        expect(session.getActiveToolSnapshot()).toBe('select')
    })

    it('clears preview when Escape-style session cancellation resets interaction', () => {
        const { placement, session } = createHarness()
        placement.activate(componentDefinition)
        placement.updatePreview({ x: 32, y: 40 })

        expect(session.cancelActiveInteraction()).toBe(true)

        expect(placement.getPreviewSnapshot()).toBeNull()
        expect(placement.isPlacementActive()).toBe(false)
        expect(session.getNodeIdsSnapshot()).toEqual(['existing', 'other'])
    })

    it('rejects unsupported activation without changing active tool', () => {
        const { placement, session } = createHarness()

        expect(placement.activate({ ...componentDefinition, kind: 'participant' })).toBe(false)
        expect(placement.isPlacementActive()).toBe(false)
        expect(session.getActiveToolSnapshot()).toBe('select')
    })
})
