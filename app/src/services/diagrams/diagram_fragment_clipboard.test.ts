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
    { id: 'one', kind: 'participant', label: 'One', legendEntryId: 'participant-focal', role: 'focal' },
    { id: 'two', kind: 'participant', label: 'Two', legendEntryId: 'participant-backend', role: 'backend' },
    { id: 'three', kind: 'participant', label: 'Three', legendEntryId: 'participant-store', role: 'store' },
]
const edges: DiagramEdge[] = [
    { from: 'one', id: 'one-two', kind: 'call', label: 'Stored call', legendEntryId: 'call-entry', to: 'two' },
    { from: 'two', id: 'two-one', kind: 'return', legendEntryId: 'return-entry', to: 'one' },
    { from: 'one', id: 'one-three', kind: 'async', legendEntryId: 'async-entry', to: 'three' },
]
const legendEntries = [
    { id: 'participant-focal', label: 'Focal', role: 'focal' as const },
    { id: 'participant-backend', label: 'Backend', role: 'backend' as const },
    { id: 'participant-store', label: 'Store', role: 'store' as const },
    { id: 'call-entry', kind: 'call' as const, label: 'Call', useLabelAsDefault: true },
    { id: 'return-entry', kind: 'return' as const, label: 'Return', useLabelAsDefault: false },
    { id: 'async-entry', kind: 'async' as const, label: 'Async', useLabelAsDefault: false },
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
        read: {
            getEdgeIdsSnapshot: () => edges.map(({ id }) => id),
            getEdgeSnapshot: (edgeId: string) => edges.find(({ id }) => id === edgeId) ?? null,
            getFragmentIdsSnapshot: () => fragments.map(({ id }) => id),
            getFragmentSnapshot: (fragmentId: string) => fragments.find(({ id }) => id === fragmentId) ?? null,
            getGroupSnapshot: (groupId: string) => groups.find(({ id }) => id === groupId) ?? null,
            getEditableDiagram: () => ({
                edges, fragments, groups,
                meta: { description: 'Sequence', legend: legendEntries, title: 'Sequence', type: 'sequence' as const, version: 3 as const },
                nodes,
            }),
            getNodeIdsSnapshot: () => nodes.map(({ id }) => id),
            getNodeSnapshot: (nodeId: string) => nodes.find(({ id }) => id === nodeId) ?? null,
        },
    }
}

function selection(...identities: DiagramSelectionIdentity[]) {
    return identities
}

describe('diagram fragment clipboard', () => {
    it('parses rootless mindmap topic fragments without adding a synthetic node', () => {
        const payload = {
            edges: [],
            format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
            fragments: [],
            groups: [],
            legendEntries: [{ id: 'topic-entry', label: 'Topic', nodeKind: 'topic' }],
            nodes: [{ height: 96, id: 'topic', kind: 'topic', label: 'Topic', legendEntryId: 'topic-entry', role: 'backend', width: 96 }],
            version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
        } as const

        expect(parseDiagramFragmentClipboardPayload(JSON.stringify(payload))).toEqual(payload)
    })

    it('migrates connection entries from the existing clipboard version with defaults disabled', () => {
        const payload = {
            edges: [edges[0]],
            format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
            fragments: [],
            groups: [],
            legendEntries: [legendEntries[0], legendEntries[1], { id: 'call-entry', kind: 'call', label: 'Call' }],
            nodes: [nodes[0], nodes[1]],
            version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
        }

        expect(parseDiagramFragmentClipboardPayload(JSON.stringify(payload)).legendEntries[2])
            .toMatchObject({ useLabelAsDefault: false })
    })

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
            legendEntries: [legendEntries[0], legendEntries[1], legendEntries[3], legendEntries[4]],
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
        ['unknown format', JSON.stringify({edges: [], format: 'foreign', fragments: [], groups: [], legendEntries: [legendEntries[0]], nodes: [nodes[0]], version: 1})],
        ['unknown version', JSON.stringify({edges: [], format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT, fragments: [], groups: [], legendEntries: [legendEntries[0]], nodes: [nodes[0]], version: 3})],
        ['dangling relationship', JSON.stringify({
            edges: [edges[0]],
            format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
            fragments: [],
            groups: [],
            legendEntries: [legendEntries[0], legendEntries[3]],
            nodes: [nodes[0]],
            version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
        })],
    ])('rejects %s before paste', (_label, content) => {
        expect(() => parseDiagramFragmentClipboardPayload(content)).toThrow('Malformed diagram clipboard data')
    })
})
