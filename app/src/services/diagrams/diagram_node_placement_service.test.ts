import { describe, expect, it, vi } from 'vitest'
import { parseDiagramData, type DiagramData, type DiagramNodeKind } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramLabelFocusService } from './diagram_label_focus_service'
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
    subscribeEdgeGeometryField: () => () => {},
    subscribeGroupGeometryField: () => () => {},
    subscribeNodeGeometryField: () => () => {},
    subscribeGeometrySession: () => () => {},
    getEdgeControlPointSnapshot: () => null,
    getEdgeRouteSnapshot: () => [],
    getGroupGeometryFieldSnapshot: () => null,
    getNodeGeometryFieldSnapshot: () => null,
}

function diagram(type: DiagramData['meta']['type'], preset?: DiagramData['meta']['preset']): DiagramData {
    const edgeKind = type === 'dependency'
        ? 'dependency'
        : type === 'entity'
            ? 'relationship'
            : type === 'sequence'
                ? 'call'
                : type === 'flow'
                    ? preset === 'state' ? 'transition' : 'flow'
                    : 'connection'
    const firstKind = type === 'sequence'
        ? 'participant'
        : type === 'entity'
            ? 'entity'
            : type === 'mindmap'
                ? 'root'
                : type === 'flow'
                    ? preset === 'state' ? 'state' : 'step'
                    : undefined
    const secondKind = type === 'mindmap' ? 'topic' : firstKind

    return parseDiagramData(JSON.stringify({
        edges: [{ from: 'existing', id: 'existing-edge', kind: edgeKind, ...(edgeKind === 'transition' ? { label: 'next' } : {}), to: 'other' }],
        groups: [],
        meta: { description: 'Placement test', ...(preset ? { preset } : {}), title: 'Placement', type, version: 1 },
        nodes: [
            { id: 'existing', label: 'Existing', role: 'focal', ...(firstKind ? { kind: firstKind } : {}), ...(type === 'entity' ? { fields: [] } : {}) },
            { id: 'other', label: 'Other', role: 'backend', ...(secondKind ? { kind: secondKind } : {}), ...(type === 'entity' ? { fields: [] } : {}) },
        ],
    }))
}

function createHarness(source = diagram('architecture')) {
    const createId = vi.fn()
        .mockReturnValueOnce('existing')
        .mockReturnValueOnce('existing-edge')
        .mockReturnValueOnce('placed-node')
    const session = new DiagramEditSessionService(new DiagramSourceStub(source), createId, vi.fn())
    const selection = new DiagramSelectionService(session, geometryStub)
    const labelFocus = new DiagramLabelFocusService(session)
    const placement = new DiagramNodePlacementService(session, selection, labelFocus)
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return { createId, labelFocus, placement, selection, session }
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

const flowchartEndDefinition = {
    defaults: { height: 48, label: 'End', role: 'focal' as const, width: 120 },
    kind: 'end' as const,
}

const stateEndDefinition = {
    defaults: { height: 24, label: 'End', role: 'focal' as const, width: 24 },
    kind: 'end' as const,
}

const participantDefinition = {
    defaults: { height: 72, label: 'New participant', role: 'focal' as const, width: 160 },
    kind: 'participant' as const,
}

const decisionDefinition = {
    defaults: { height: 96, label: 'New decision', role: 'focal' as const, width: 96 },
    kind: 'decision' as const,
}

const stateDefinition = {
    defaults: { height: 72, label: 'New state', role: 'focal' as const, width: 160 },
    kind: 'state' as const,
}

const entityDefinition = {
    defaults: { fields: [], label: 'New entity', role: 'focal' as const, width: 160 },
    kind: 'entity' as const,
    previewSize: { height: 48, width: 160 },
}

describe('DiagramNodePlacementService', () => {
    it('places two nodes without reselecting their creation tool', () => {
        const { createId, labelFocus, placement, session } = createHarness()
        createId.mockReturnValueOnce('second-node')
        placement.activate(componentDefinition)

        placement.updatePreview({ x: 32, y: 40 })
        expect(placement.place({ x: 32, y: 40 }, true)).toBe('placed-node')
        expect(labelFocus.getTargetSnapshot()).toEqual({ objectId: 'placed-node', objectKind: 'node' })
        placement.updatePreview({ x: 80, y: 88 })
        expect(placement.place({ x: 80, y: 88 }, true)).toBe('second-node')

        expect(session.read.getNodeIdsSnapshot()).toContain('second-node')
        expect(session.read.getActiveToolSnapshot()).toBe('node:component')
        expect(placement.getPreviewSnapshot()).toBeNull()
        expect(labelFocus.getTargetSnapshot()).toEqual({ objectId: 'second-node', objectKind: 'node' })
    })

    it('returns to Select and keeps the node selected when placed without continuous add', () => {
        const { labelFocus, placement, selection, session } = createHarness()
        placement.activate(componentDefinition)

        expect(placement.place({ x: 32, y: 40 }, false)).toBe('placed-node')

        expect(session.read.getActiveToolSnapshot()).toBe('select')
        expect(session.read.getLastSelectedCreationToolSnapshot()).toBe('node:component')
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(placement.isPlacementActive()).toBe(false)
        expect(labelFocus.getTargetSnapshot()).toEqual({ objectId: 'placed-node', objectKind: 'node' })
    })

    it('keeps the node tool active when a create is rejected', () => {
        const { labelFocus, placement, session } = createHarness()
        placement.activate(componentDefinition)
        vi.spyOn(session, 'createNode').mockReturnValue(null)

        expect(placement.place({ x: 32, y: 40 }, false)).toBeNull()

        expect(session.read.getActiveToolSnapshot()).toBe('node:component')
        expect(labelFocus.getTargetSnapshot()).toBeNull()
    })

    it('switches to Topic after placing the only allowed mindmap root, even without continuous add', () => {
        const source = diagram('mindmap')
        source.nodes = []
        source.edges = []
        const { createId, placement, session } = createHarness(source)
        createId.mockReset().mockReturnValueOnce('root-one').mockReturnValueOnce('topic-one').mockReturnValueOnce('topic-two')
        placement.activate({ defaults: { height: 128, label: 'Root', role: 'focal', width: 128 }, kind: 'root' })
        placement.updatePreview({ x: 40, y: 40 })

        expect(placement.place({ x: 40, y: 40 }, false)).toBe('root-one')
        expect(session.read.getActiveToolSnapshot()).toBe('node:topic')
        expect(placement.isNodeKindAvailable('root')).toBe(false)
        expect(placement.place({ x: 100, y: 100 }, true)).toBe('topic-one')
        expect(session.read.getActiveToolSnapshot()).toBe('node:topic')
        expect(placement.place({ x: 200, y: 200 }, false)).toBe('topic-two')
        expect(session.read.getActiveToolSnapshot()).toBe('select')
    })

    it.each(['architecture', 'dependency'] as const)(
        'previews on the grid, then creates and selects one component in a %s diagram through one membership mutation',
        (diagramType) => {
            const { createId, placement, selection, session } = createHarness(diagram(diagramType))
            const originalNodes = session.read.getEditableDiagram()?.nodes
            const originalNode = session.read.getNodeSnapshot('existing')
            const originalNodeIds = session.read.getNodeIdsSnapshot()
            const membershipChanged = vi.fn()
            const previewChanged = vi.fn()
            session.read.subscribeCollectionMembership('node', membershipChanged)
            placement.subscribePreview(previewChanged)

            expect(placement.activate(componentDefinition)).toBe(true)
            expect(placement.updatePreview({ x: 13, y: 18 })).toBe(true)

            expect(placement.getPreviewSnapshot()?.node).toMatchObject({ height: 72, kind: 'component', width: 160, x: 12, y: 20 })
            expect(session.read.getEditableDiagram()?.nodes).toBe(originalNodes)
            expect(session.read.getNodeIdsSnapshot()).toBe(originalNodeIds)
            expect(membershipChanged).not.toHaveBeenCalled()
            expect(session.read.getTransientGestureSnapshot()).toBe('placement')

            expect(placement.place({ x: 13, y: 18 }, true)).toBe('placed-node')

            expect(createId).toHaveBeenCalledTimes(3)
            expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
            expect(session.read.getNodeIdsSnapshot()).toEqual(['existing', 'other', 'placed-node'])
            expect(session.read.getNodeFieldSnapshot('placed-node', 'x')).toBe(12)
            expect(session.read.getNodeFieldSnapshot('placed-node', 'y')).toBe(20)
            expect(membershipChanged).toHaveBeenCalledOnce()
            expect(session.read.getChangeIdsSnapshot()).toHaveLength(1)
            expect(session.read.getChange(session.read.getChangeIdsSnapshot()[0])).toMatchObject({category: 'collection', objectId: 'placed-node', objectKind: 'node', value: expect.objectContaining({ id: 'placed-node' })})
            expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
            expect(placement.getPreviewSnapshot()).toBeNull()
            expect(session.read.getTransientGestureSnapshot()).toBeNull()
            expect(session.read.getActiveToolSnapshot()).toBe('node:component')
            expect(previewChanged).toHaveBeenCalledTimes(2)
        },
    )

    it('places one valid sequence participant without replacing existing sequence objects', () => {
        const source = diagram('sequence')
        source.edges = [{ legendEntryId: 'call', from: 'existing', id: 'existing-edge', kind: 'call', to: 'other' }]
        source.fragments = [{ id: 'existing-fragment', operator: 'opt', regions: [{ edgeIds: ['existing-edge'], guard: 'sent' }] }]
        source.nodes = source.nodes.map((node, index) => ({...node, height: 72, kind: 'participant', width: 160, x: 40 + index * 216, y: 40}))
        const { placement, selection, session } = createHarness(source)
        const editableDiagram = session.read.getEditableDiagram()
        const nodes = editableDiagram?.nodes
        const existingNode = session.read.getNodeSnapshot('existing')
        const otherNode = session.read.getNodeSnapshot('other')
        const edges = editableDiagram?.edges
        const existingEdge = session.read.getEdgeSnapshot('existing-edge')
        const fragments = editableDiagram?.fragments
        const existingFragment = session.read.getFragmentSnapshot('existing-fragment')

        expect(placement.activate(participantDefinition)).toBe(true)
        expect(placement.place({ x: 503, y: 43 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            height: 72,
            id: 'placed-node',
            kind: 'participant',
            label: 'New participant',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: 160,
            x: 504,
            y: 44,
        })
        expect(session.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(session.read.getNodeSnapshot('existing')).toBe(existingNode)
        expect(session.read.getNodeSnapshot('other')).toBe(otherNode)
        expect(session.read.getEditableDiagram()?.edges).toBe(edges)
        expect(session.read.getEdgeSnapshot('existing-edge')).toBe(existingEdge)
        expect(session.read.getEditableDiagram()?.fragments).toBe(fragments)
        expect(session.read.getFragmentSnapshot('existing-fragment')).toBe(existingFragment)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.read.getActiveToolSnapshot()).toBe('node:participant')
    })

    it('places and selects one entity while leaving its default height derived', () => {
        const { placement, selection, session } = createHarness(diagram('entity'))

        expect(placement.activate(entityDefinition)).toBe(true)
        expect(placement.updatePreview({ x: 31, y: 42 })).toBe(true)
        expect(placement.getPreviewSnapshot()?.node).toMatchObject({fields: [], height: 48, kind: 'entity', width: 160, x: 32, y: 44})
        expect(placement.place({ x: 31, y: 42 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            fields: [],
            id: 'placed-node',
            kind: 'entity',
            label: 'New entity',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: 160,
            x: 32,
            y: 44,
        })
        expect(session.read.getNodeFieldSnapshot('placed-node', 'height')).toBeUndefined()
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
    })

    it('creates and selects one step in a flowchart diagram through one membership mutation', () => {
        const source = diagram('flow', 'flowchart')
        source.edges = [{ legendEntryId: 'flow', from: 'existing', id: 'existing-edge', kind: 'flow', label: 'next', to: 'other' }]
        const { placement, selection, session } = createHarness(source)
        const originalNode = session.read.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.read.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(stepDefinition)).toBe(true)

        expect(placement.place({ x: 13, y: 18 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
        expect(session.read.getNodeIdsSnapshot()).toEqual(['existing', 'other', 'placed-node'])
        expect(session.read.getNodeFieldSnapshot('placed-node', 'kind')).toBe('step')
        expect(session.read.getNodeFieldSnapshot('placed-node', 'label')).toBe('New step')
        expect(session.read.getNodeFieldSnapshot('placed-node', 'x')).toBe(12)
        expect(session.read.getNodeFieldSnapshot('placed-node', 'y')).toBe(20)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.read.getChangeIdsSnapshot()).toHaveLength(1)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.read.getActiveToolSnapshot()).toBe('node:step')
    })

    it('creates one valid decision with rectangular geometry and keeps branch-label validation active', () => {
        const { placement, selection, session } = createHarness(diagram('flow', 'flowchart'))
        const originalNode = session.read.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.read.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(decisionDefinition)).toBe(true)
        expect(placement.place({ x: 41, y: 58 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            height: 96,
            id: 'placed-node',
            kind: 'decision',
            label: 'New decision',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: 96,
            x: 40,
            y: 60,
        })
        expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.createEdge({ legendEntryId: 'flow', from: 'placed-node', kind: 'flow', to: 'existing' })).toBeNull()
        expect(session.read.getEdgeIdsSnapshot()).toEqual(['existing-edge'])
    })

    it('creates and selects one stable state through one membership mutation', () => {
        const source = diagram('flow', 'state')
        source.edges = [{ legendEntryId: 'transition', from: 'existing', id: 'existing-edge', kind: 'transition', label: 'next', to: 'other' }]
        source.nodes = source.nodes.map((node) => ({ ...node, kind: 'state' }))
        const { createId, placement, selection, session } = createHarness(source)
        const originalNode = session.read.getNodeSnapshot('existing')
        const originalEdge = session.read.getEdgeSnapshot('existing-edge')
        const membershipChanged = vi.fn()
        session.read.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(stateDefinition)).toBe(true)
        expect(placement.place({ x: 13, y: 18 }, true)).toBe('placed-node')

        expect(createId).toHaveBeenCalledTimes(3)
        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            height: 72,
            id: 'placed-node',
            kind: 'state',
            label: 'New state',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: 160,
            x: 12,
            y: 20,
        })
        expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
        expect(session.read.getEdgeSnapshot('existing-edge')).toBe(originalEdge)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.read.getChangeIdsSnapshot()).toHaveLength(1)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.read.getActiveToolSnapshot()).toBe('node:state')
    })

    it.each([
        ['flowchart', flowchartStartDefinition, { height: 48, width: 120 }],
        ['state', stateStartDefinition, { height: 24, width: 24 }],
    ] as const)('places one schema-complete start node in a %s diagram', (preset, definition, size) => {
        const source = diagram('flow', preset)
        source.edges = [{ legendEntryId: 'legend-entry', from: 'existing', id: 'existing-edge', kind: preset === 'state' ? 'transition' : 'flow', label: 'next', to: 'other' }]
        source.nodes = source.nodes.map((node) => ({ ...node, kind: preset === 'state' ? 'state' : 'step' }))
        const { placement, selection, session } = createHarness(source)
        const originalNode = session.read.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.read.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(definition)).toBe(true)

        expect(placement.place({ x: 13, y: 18 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            height: size.height,
            id: 'placed-node',
            kind: 'start',
            label: 'Start',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: size.width,
            x: 12,
            y: 20,
        })
        expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.read.getChangeIdsSnapshot()).toHaveLength(2)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.read.getActiveToolSnapshot()).toBe('node:start')
    })

    it.each([
        ['flowchart', flowchartEndDefinition, { height: 48, width: 120 }],
        ['state', stateEndDefinition, { height: 24, width: 24 }],
    ] as const)('places one schema-complete end node in a %s diagram', (preset, definition, size) => {
        const source = diagram('flow', preset)
        source.edges = [{ legendEntryId: 'legend-entry', from: 'existing', id: 'existing-edge', kind: preset === 'state' ? 'transition' : 'flow', label: 'next', to: 'other' }]
        source.nodes = source.nodes.map((node) => ({ ...node, kind: preset === 'state' ? 'state' : 'step' }))
        const { placement, selection, session } = createHarness(source)
        const originalNode = session.read.getNodeSnapshot('existing')
        const membershipChanged = vi.fn()
        session.read.subscribeCollectionMembership('node', membershipChanged)

        expect(placement.activate(definition)).toBe(true)

        expect(placement.place({ x: 13, y: 18 }, true)).toBe('placed-node')

        expect(session.read.getNodeSnapshot('placed-node')).toEqual({
            height: size.height,
            id: 'placed-node',
            kind: 'end',
            label: 'End',
            legendEntryId: expect.any(String),
            role: 'focal',
            width: size.width,
            x: 12,
            y: 20,
        })
        expect(session.read.getNodeSnapshot('existing')).toBe(originalNode)
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(session.read.getChangeIdsSnapshot()).toHaveLength(2)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'placed-node', objectKind: 'node' }])
        expect(session.read.getActiveToolSnapshot()).toBe('node:end')
    })

    it.each([
        ['architecture', undefined, 'component', true],
        ['flow', 'flowchart', 'step', true],
        ['architecture', undefined, 'participant', false],
        ['sequence', undefined, 'participant', true],
        ['entity', undefined, 'entity', true],
        ['flow', 'flowchart', 'decision', true],
        ['flow', 'flowchart', 'end', true],
        ['flow', 'flowchart', 'state', false],
        ['flow', 'state', 'state', true],
        ['flow', 'state', 'end', true],
        ['flow', 'state', 'step', false],
        ['flow', 'flowchart', 'start', true],
        ['flow', 'state', 'start', true],
    ] as const)('reports %s/%s kind %s availability as %s', (type, preset, kind, available) => {
        const source = diagram(type, preset)
        if (type === 'sequence') source.edges = [{ legendEntryId: 'call', from: 'existing', id: 'existing-edge', kind: 'call', to: 'other' }]
        if (type === 'flow') {
            source.edges = [{ legendEntryId: 'legend-entry', from: 'existing', id: 'existing-edge', kind: preset === 'state' ? 'transition' : 'flow', label: 'next', to: 'other' }]
            source.nodes = source.nodes.map((node) => ({ ...node, kind: preset === 'state' ? 'state' : 'step' }))
        }
        const { placement } = createHarness(source)

        expect(placement.isNodeKindAvailable(kind as DiagramNodeKind)).toBe(available)
    })

    it('cancels preview without creating a node and returns to Select', () => {
        const { labelFocus, placement, session } = createHarness()
        const nodeIds = session.read.getNodeIdsSnapshot()
        placement.activate(componentDefinition)
        placement.updatePreview({ x: 32, y: 40 })

        expect(placement.cancelPlacement()).toBe(true)

        expect(session.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(session.read.getChangeIdsSnapshot()).toEqual([])
        expect(placement.getPreviewSnapshot()).toBeNull()
        expect(session.read.getActiveToolSnapshot()).toBe('node:component')
        expect(labelFocus.getTargetSnapshot()).toBeNull()
    })

    it('clears preview when placement is canceled and keeps its tool available', () => {
        const { placement, session } = createHarness()
        placement.activate(componentDefinition)
        placement.updatePreview({ x: 32, y: 40 })

        expect(placement.cancelPlacement()).toBe(true)

        expect(placement.getPreviewSnapshot()).toBeNull()
        expect(placement.isPlacementActive()).toBe(true)
        expect(session.read.getNodeIdsSnapshot()).toEqual(['existing', 'other'])
    })

    it('rejects unsupported activation without changing active tool', () => {
        const { placement, session } = createHarness()

        expect(placement.activate({ ...componentDefinition, kind: 'participant' })).toBe(false)
        expect(placement.isPlacementActive()).toBe(false)
        expect(session.read.getActiveToolSnapshot()).toBe('select')
    })

    it('uses selected legend role for preview and node while keeping tool defaults', () => {
        const source = diagram('architecture')
        const backendEntry = { legendEntryId: 'legend-entry', id: 'backend-entry', label: 'Backend', role: 'backend' as const }
        source.meta.legend.push(backendEntry)
        const { placement, session } = createHarness(source)
        placement.activate(componentDefinition)
        expect(session.selectLegendEntry(backendEntry.id)).toBe(true)

        placement.updatePreview({ x: 32, y: 40 })
        expect(placement.getPreviewSnapshot()?.node).toMatchObject({ kind: 'component', role: 'backend', width: 160 })
        placement.place({ x: 32, y: 40 }, true)

        expect(session.read.getNodeSnapshot('placed-node')).toMatchObject({ kind: 'component', role: 'backend', width: 160 })
        expect(session.read.getActiveToolSnapshot()).toBe('node:component')
        expect(session.read.getSelectedLegendEntryKeySnapshot()).toBe(backendEntry.id)
    })

    it('keeps node default when selected legend entry is a connection', () => {
        const { placement, session } = createHarness()
        placement.activate(componentDefinition)
        const connectionEntry = session.read.getEditableDiagram()?.meta.legend.find((entry) => 'kind' in entry && entry.kind === 'connection')
        if (!connectionEntry) throw new Error('Missing connection legend entry')
        expect(session.selectLegendEntry(connectionEntry.id)).toBe(true)

        placement.updatePreview({ x: 32, y: 40 })
        expect(placement.getPreviewSnapshot()?.node.role).toBe('focal')
        placement.place({ x: 32, y: 40 }, true)
        expect(session.read.getNodeSnapshot('placed-node')?.role).toBe('focal')
    })
})
