import { describe, expect, it } from 'vitest'
import type {
    DiagramEdge,
    DiagramGroup,
    DiagramNode,
    DiagramSequenceFragment,
} from './diagram_data'
import {
    buildDiagramFragmentClipboardPayload,
    DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
    DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
    parseDiagramFragmentClipboardPayload,
    serializeDiagramFragmentClipboardPayload,
} from './diagram_fragment_clipboard'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

const nodes: DiagramNode[] = [
    { id: 'one', kind: 'participant', label: 'One', role: 'focal' },
    { id: 'two', kind: 'participant', label: 'Two', role: 'backend' },
    { id: 'three', kind: 'participant', label: 'Three', role: 'store' },
]
const edges: DiagramEdge[] = [
    { from: 'one', id: 'one-two', kind: 'call', to: 'two' },
    { from: 'two', id: 'two-one', kind: 'return', to: 'one' },
    { from: 'one', id: 'one-three', kind: 'async', to: 'three' },
]
const groups: DiagramGroup[] = [
    { id: 'selected-group', label: 'Selected', nodeIds: ['one', 'two'] },
    { id: 'partial-group', label: 'Partial', nodeIds: ['one', 'three'] },
]
const fragments: DiagramSequenceFragment[] = [
    { id: 'fragment', operator: 'opt', regions: [{ edgeIds: ['one-two', 'one-three'], guard: 'optional' }] },
]

function diagramFragmentReader() {
    return {
        getEdgeIdsSnapshot: () => edges.map(({ id }) => id),
        getEdgeSnapshot: (edgeId: string) => edges.find(({ id }) => id === edgeId) ?? null,
        getFragmentIdsSnapshot: () => fragments.map(({ id }) => id),
        getFragmentSnapshot: (fragmentId: string) => fragments.find(({ id }) => id === fragmentId) ?? null,
        getGroupSnapshot: (groupId: string) => groups.find(({ id }) => id === groupId) ?? null,
        getNodeIdsSnapshot: () => nodes.map(({ id }) => id),
        getNodeSnapshot: (nodeId: string) => nodes.find(({ id }) => id === nodeId) ?? null,
    }
}

function selection(...identities: DiagramSelectionIdentity[]) {
    return identities
}

describe('diagram fragment clipboard', () => {
    it('serializes selected objects, connecting edges, and valid relationship subsets', () => {
        const reader = diagramFragmentReader()
        const identities = selection(
            { objectId: 'one', objectKind: 'node' },
            { objectId: 'two', objectKind: 'node' },
            { objectId: 'selected-group', objectKind: 'group' },
        )

        const payload = buildDiagramFragmentClipboardPayload(identities, reader)

        expect(payload).toEqual({
            edges: [edges[0], edges[1]],
            format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
            fragments: [{ id: 'fragment', operator: 'opt', regions: [{ edgeIds: ['one-two'], guard: 'optional' }] }],
            groups: [groups[0]],
            nodes: [nodes[0], nodes[1]],
            version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
        })
        if (!payload) throw new Error('Expected supported diagram clipboard payload')
        expect(parseDiagramFragmentClipboardPayload(serializeDiagramFragmentClipboardPayload(payload))).toEqual(payload)
    })

    it.each([
        ['empty selection', selection()],
        ['edge without both endpoints', selection(
            { objectId: 'one', objectKind: 'node' },
            { objectId: 'one-three', objectKind: 'edge' },
        )],
        ['group without every member', selection(
            { objectId: 'one', objectKind: 'node' },
            { objectId: 'partial-group', objectKind: 'group' },
        )],
        ['selection without nodes', selection({ objectId: 'selected-group', objectKind: 'group' })],
        ['selection containing every node', selection(
            { objectId: 'one', objectKind: 'node' },
            { objectId: 'two', objectKind: 'node' },
            { objectId: 'three', objectKind: 'node' },
        )],
    ])('rejects unsupported %s', (_label, identities) => {
        expect(buildDiagramFragmentClipboardPayload(identities, diagramFragmentReader())).toBeNull()
    })

    it('does not mutate selected source objects while reading them', () => {
        const before = JSON.stringify({ edges, fragments, groups, nodes })
        const identities = selection(
            { objectId: 'one', objectKind: 'node' },
            { objectId: 'two', objectKind: 'node' },
        )

        buildDiagramFragmentClipboardPayload(identities, diagramFragmentReader())

        expect(JSON.stringify({ edges, fragments, groups, nodes })).toBe(before)
    })

    it.each([
        ['invalid JSON', '{'],
        ['unknown format', JSON.stringify({edges: [], format: 'foreign', fragments: [], groups: [], nodes: [nodes[0]], version: 1})],
        ['unknown version', JSON.stringify({edges: [], format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT, fragments: [], groups: [], nodes: [nodes[0]], version: 2})],
        ['dangling relationship', JSON.stringify({
            edges: [edges[0]],
            format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
            fragments: [],
            groups: [],
            nodes: [nodes[0]],
            version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
        })],
    ])('rejects %s before paste', (_label, content) => {
        expect(() => parseDiagramFragmentClipboardPayload(content)).toThrow('Malformed diagram clipboard data')
    })
})
