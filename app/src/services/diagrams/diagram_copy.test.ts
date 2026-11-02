import { describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramEdge, DiagramNode } from './diagram_data'
import { copyDiagramSelection } from './diagram_copy'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

const nodes: DiagramNode[] = [
    { id: 'one', label: 'One', legendEntryId: 'focal', role: 'focal' },
    { id: 'two', label: 'Two', legendEntryId: 'backend', role: 'backend' },
    { id: 'three', label: 'Three', legendEntryId: 'store', role: 'store' },
]
const edges: DiagramEdge[] = [
    { from: 'one', id: 'one-two', kind: 'connection', legendEntryId: 'connection', to: 'two' },
    { from: 'one', id: 'one-three', kind: 'connection', legendEntryId: 'connection', to: 'three' },
]
const diagram: DiagramData = {
    edges,
    groups: [],
    meta: {
        description: 'Copy test',
        legend: [
            { id: 'focal', label: 'Focal', role: 'focal' },
            { id: 'backend', label: 'Backend', role: 'backend' },
            { id: 'store', label: 'Store', role: 'store' },
            { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
        ],
        title: 'Copy test',
        type: 'architecture',
        version: 3,
    },
    nodes,
}

function diagramCopySession() {
    return {
        read: {
            getEdgeIdsSnapshot: () => edges.map(({ id }) => id),
            getEdgeSnapshot: (edgeId: string) => edges.find(({ id }) => id === edgeId) ?? null,
            getFragmentIdsSnapshot: () => [],
            getFragmentSnapshot: () => null,
            getEditableDiagram: () => diagram,
            getGroupSnapshot: () => null,
            getNodeIdsSnapshot: () => nodes.map(({ id }) => id),
            getNodeSnapshot: (nodeId: string) => nodes.find(({ id }) => id === nodeId) ?? null,
        },
    }
}

function supportedSelection(): readonly DiagramSelectionIdentity[] {
    return Object.freeze([
        Object.freeze({ objectId: 'one', objectKind: 'node' as const }),
        Object.freeze({ objectId: 'two', objectKind: 'node' as const }),
    ])
}

describe('diagram copy', () => {
    it('captures one node only after clipboard write succeeds', async () => {
        const session = diagramCopySession()
        const selection = [{ objectId: 'one', objectKind: 'node' as const }]
        const clipboardWriter = vi.fn(async () => undefined)
        const formatPaste = { captureSuccessfulCopy: vi.fn(() => true) }

        await expect(copyDiagramSelection(
            selection,
            session,
            clipboardWriter,
            vi.fn(),
            formatPaste,
        )).resolves.toBe(true)

        expect(clipboardWriter).toHaveBeenCalledOnce()
        expect(formatPaste.captureSuccessfulCopy).toHaveBeenCalledWith(selection, session)
        expect(clipboardWriter.mock.invocationCallOrder[0]).toBeLessThan(
            formatPaste.captureSuccessfulCopy.mock.invocationCallOrder[0],
        )
    })

    it('writes selected fragment without mutating selection or source objects', async () => {
        const session = diagramCopySession()
        const selection = supportedSelection()
        const selectionBefore = JSON.stringify(selection)
        const sourceBefore = JSON.stringify({ edges, nodes })
        const clipboardWriter = vi.fn<(content: string) => Promise<void>>(async () => undefined)
        const formatPaste = { captureSuccessfulCopy: vi.fn(() => false) }

        await expect(copyDiagramSelection(selection, session, clipboardWriter, vi.fn(), formatPaste)).resolves.toBe(true)

        expect(clipboardWriter).toHaveBeenCalledOnce()
        expect(JSON.parse(clipboardWriter.mock.calls[0][0])).toMatchObject({
            edges: [edges[0]],
            nodes: [nodes[0], nodes[1]],
            version: 2,
        })
        expect(formatPaste.captureSuccessfulCopy).toHaveBeenCalledWith(selection, session)
        expect(JSON.stringify(selection)).toBe(selectionBefore)
        expect(JSON.stringify({ edges, nodes })).toBe(sourceBefore)
    })

    it('reports clipboard failure without changing captured selection', async () => {
        const selection = supportedSelection()
        const clipboardError = new Error('Clipboard denied')
        const errorReporter = vi.fn()
        const clipboardWriter = vi.fn(async () => { throw clipboardError })
        const formatPaste = { captureSuccessfulCopy: vi.fn(() => true) }

        await expect(copyDiagramSelection(
            selection,
            diagramCopySession(),
            clipboardWriter,
            errorReporter,
            formatPaste,
        )).resolves.toBe(false)

        expect(errorReporter).toHaveBeenCalledWith(clipboardError)
        expect(formatPaste.captureSuccessfulCopy).not.toHaveBeenCalled()
        expect(selection).toEqual(supportedSelection())
    })

    it('reports unsupported non-empty selection without writing clipboard', async () => {
        const unsupportedSelection = [{ objectId: 'backend-group', objectKind: 'group' as const }]
        const clipboardWriter = vi.fn(async () => undefined)
        const errorReporter = vi.fn()

        await expect(copyDiagramSelection(
            unsupportedSelection,
            diagramCopySession(),
            clipboardWriter,
            errorReporter,
            { captureSuccessfulCopy: vi.fn(() => false) },
        )).resolves.toBe(false)

        expect(clipboardWriter).not.toHaveBeenCalled()
        expect(errorReporter).toHaveBeenCalledWith(expect.objectContaining({message: 'Diagram selection cannot form a supported clipboard fragment'}))
    })

    it('captures one connection without changing system clipboard content', async () => {
        const selection = [{ objectId: 'one-two', objectKind: 'edge' as const }]
        const clipboardWriter = vi.fn(async () => undefined)
        const formatPaste = { captureSuccessfulCopy: vi.fn(() => true) }

        await expect(copyDiagramSelection(
            selection,
            diagramCopySession(),
            clipboardWriter,
            vi.fn(),
            formatPaste,
        )).resolves.toBe(true)

        expect(clipboardWriter).not.toHaveBeenCalled()
        expect(formatPaste.captureSuccessfulCopy).toHaveBeenCalledOnce()
    })
})
