import { useCallback, useSyncExternalStore } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import {
    MINIMUM_DIAGRAM_ZOOM, DiagramEditSessionService, type DiagramPersistentTool,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { useDiagramNodeGeometryField } from './use_diagram_geometry'
import { useIsDiagramObjectSelected } from './use_diagram_selection'
import { useActiveDiagramTool } from './use_diagram_tool'
import {
    useEditableDiagramEdgeField,
    useEditableDiagramFragmentField,
    useEditableDiagramGroupField,
    useEditableDiagramMetadataField,
    useEditableDiagramNodeField,
} from './use_editable_diagram'

const diagram: DiagramData = {
    edges: [
        { from: 'one', id: 'one-two', kind: 'call', label: 'first call', to: 'two' },
        { from: 'two', id: 'two-three', kind: 'return', label: 'second call', to: 'three' },
    ],
    fragments: [
        { id: 'first-fragment', operator: 'opt', regions: [{ edgeIds: ['one-two'], guard: 'first' }] },
        { id: 'second-fragment', operator: 'loop', regions: [{ edgeIds: ['two-three'], guard: 'second' }] },
    ],
    groups: [
        { id: 'first-group', label: 'First group', nodeIds: ['one'] },
        { id: 'second-group', label: 'Second group', nodeIds: ['three'] },
    ],
    meta: { description: 'Rendering isolation', title: 'Sequence', type: 'sequence', version: 1 },
    nodes: [
        { id: 'one', kind: 'participant', label: 'One', role: 'focal' },
        { id: 'two', kind: 'participant', label: 'Two', role: 'backend' },
        { id: 'three', kind: 'participant', label: 'Three', role: 'external' },
    ],
}
const record: DiagramRecord = { actionId: 'sequence', id: 'diagram-1', label: 'Sequence', path: 'design/diagrams/sequence.json' }

type RenderCounts = Map<string, number>

function countRender(counts: RenderCounts, id: string) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

interface LeafProps {
    counts: RenderCounts
    geometry: DiagramGeometryService
    selection: DiagramSelectionService
    session: DiagramEditSessionService
}

function MetadataLeaf({ counts, session }: LeafProps) {
    useEditableDiagramMetadataField('title', session)
    countRender(counts, 'metadata')

    return null
}

function NodeLeaf({ counts, nodeId, session }: LeafProps & { nodeId: string }) {
    useEditableDiagramNodeField(nodeId, 'label', session)
    countRender(counts, `node:${nodeId}`)

    return null
}

function EdgeLeaf({ counts, edgeId, session }: LeafProps & { edgeId: string }) {
    useEditableDiagramEdgeField(edgeId, 'label', session)
    countRender(counts, `edge:${edgeId}`)

    return null
}

function GroupLeaf({ counts, groupId, session }: LeafProps & { groupId: string }) {
    useEditableDiagramGroupField(groupId, 'label', session)
    countRender(counts, `group:${groupId}`)

    return null
}

function FragmentLeaf({ counts, fragmentId, session }: LeafProps & { fragmentId: string }) {
    useEditableDiagramFragmentField(fragmentId, 'operator', session)
    countRender(counts, `fragment:${fragmentId}`)

    return null
}

function SelectionLeaf({ counts, nodeId, selection }: LeafProps & { nodeId: string }) {
    useIsDiagramObjectSelected(nodeId, 'node', selection)
    countRender(counts, `selection:${nodeId}`)

    return null
}

function GeometryLeaf({ counts, geometry, nodeId }: LeafProps & { nodeId: string }) {
    useDiagramNodeGeometryField(nodeId, 'x', geometry)
    countRender(counts, `geometry:${nodeId}`)

    return null
}

function ZoomLeaf({ counts, session }: LeafProps) {
    useSyncExternalStore(session.subscribeViewportScale, session.getViewportScaleSnapshot, session.getViewportScaleSnapshot)
    countRender(counts, 'zoom')

    return null
}

function ZoomMinimumLeaf({ counts, session }: LeafProps) {
    const getSnapshot = useCallback(
        () => session.getViewportScaleSnapshot() <= MINIMUM_DIAGRAM_ZOOM,
        [session],
    )
    useSyncExternalStore(session.subscribeViewportScale, getSnapshot, getSnapshot)
    countRender(counts, 'zoom-minimum')

    return null
}

function ToolLeaf({ counts, session, tool }: LeafProps & { tool: DiagramPersistentTool }) {
    useActiveDiagramTool(session, tool)
    countRender(counts, `tool:${tool}`)

    return null
}

function DiagramCollections(props: LeafProps) {
    const { counts } = props
    countRender(counts, 'collections')

    return (
        <>
            <MetadataLeaf {...props} />
            <NodeLeaf {...props} nodeId="one" />
            <NodeLeaf {...props} nodeId="three" />
            <EdgeLeaf {...props} edgeId="one-two" />
            <EdgeLeaf {...props} edgeId="two-three" />
            <GroupLeaf {...props} groupId="first-group" />
            <GroupLeaf {...props} groupId="second-group" />
            <FragmentLeaf {...props} fragmentId="first-fragment" />
            <FragmentLeaf {...props} fragmentId="second-fragment" />
            <SelectionLeaf {...props} nodeId="one" />
            <SelectionLeaf {...props} nodeId="three" />
            <GeometryLeaf {...props} nodeId="one" />
            <GeometryLeaf {...props} nodeId="three" />
            <ZoomLeaf {...props} />
            <ZoomMinimumLeaf {...props} />
            <ToolLeaf {...props} tool="node:component" />
            <ToolLeaf {...props} tool="group" />
        </>
    )
}

function DiagramParent(props: LeafProps) {
    countRender(props.counts, 'parent')

    return <DiagramCollections {...props} />
}

function DiagramRoot(props: LeafProps) {
    countRender(props.counts, 'root')

    return <DiagramParent {...props} />
}

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session, geometry)
    const counts: RenderCounts = new Map()
    render(<DiagramRoot counts={counts} geometry={geometry} selection={selection} session={session} />)

    return { counts, geometry, selection, session }
}

afterEach(cleanup)

describe('diagram editor render isolation', () => {
    it.each([
        ['metadata', 'metadata', ({ session }: ReturnType<typeof createHarness>) => session.setMetadataField('title', 'Updated')],
        ['node', 'node:one', ({ session }: ReturnType<typeof createHarness>) => session.setNodeField('one', 'label', 'Updated')],
        ['edge', 'edge:one-two', ({ session }: ReturnType<typeof createHarness>) => session.setEdgeField('one-two', 'label', 'Updated')],
        ['group', 'group:first-group', ({ session }: ReturnType<typeof createHarness>) => session.setGroupField('first-group', 'label', 'Updated')],
        ['fragment', 'fragment:first-fragment', ({ session }: ReturnType<typeof createHarness>) => session.setFragmentField('first-fragment', 'operator', 'loop')],
        ['selection', 'selection:one', ({ selection }: ReturnType<typeof createHarness>) => selection.replace([{ objectId: 'one', objectKind: 'node' }])],
        ['geometry', 'geometry:one', ({ session }: ReturnType<typeof createHarness>) => session.setNodeField('one', 'x', 200)],
        ['zoom', 'zoom', ({ session }: ReturnType<typeof createHarness>) => session.zoomIn()],
        ['tool', 'tool:node:component', ({ session }: ReturnType<typeof createHarness>) => session.setActiveTool('node:component')],
    ] as const)('rerenders only owning %s leaf', (_changeKind, ownerId, mutate) => {
        const harness = createHarness()
        const before = new Map(harness.counts)

        act(() => { mutate(harness) })

        expect(harness.counts.get(ownerId)).toBeGreaterThan(before.get(ownerId) ?? 0)
        for (const [id, count] of before) {
            if (id !== ownerId) expect(harness.counts.get(id), id).toBe(count)
        }
    })
})
