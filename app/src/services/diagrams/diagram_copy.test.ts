import { describe, expect, it, vi } from 'vitest'
import type { DiagramEdge, DiagramNode } from './diagram_data'
import { copyDiagramSelection } from './diagram_copy'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

const nodes: DiagramNode[] = [
    { id: 'one', label: 'One', role: 'focal' },
    { id: 'two', label: 'Two', role: 'backend' },
    { id: 'three', label: 'Three', role: 'store' },
]
const edges: DiagramEdge[] = [
    { from: 'one', id: 'one-two', kind: 'connection', to: 'two' },
    { from: 'one', id: 'one-three', kind: 'connection', to: 'three' },
]

function diagramCopySession() {
    return {
        getEdgeIdsSnapshot: () => edges.map(({ id }) => id),
        getEdgeSnapshot: (edgeId: string) => edges.find(({ id }) => id === edgeId) ?? null,
        getFragmentIdsSnapshot: () => [],
        getFragmentSnapshot: () => null,
        getGroupSnapshot: () => null,
        getNodeIdsSnapshot: () => nodes.map(({ id }) => id),
        getNodeSnapshot: (nodeId: string) => nodes.find(({ id }) => id === nodeId) ?? null,
    }
}

function supportedSelection(): readonly DiagramSelectionIdentity[] {
    return Object.freeze([
        Object.freeze({ objectId: 'one', objectKind: 'node' as const }),
        Object.freeze({ objectId: 'two', objectKind: 'node' as const }),
    ])
}

describe('diagram copy', () => {
    it('writes selected fragment without mutating selection or source objects', async () => {
        const session = diagramCopySession()
        const selection = supportedSelection()
        const selectionBefore = JSON.stringify(selection)
        const sourceBefore = JSON.stringify({ edges, nodes })
        const clipboardWriter = vi.fn<(content: string) => Promise<void>>(async () => undefined)

        await expect(copyDiagramSelection(selection, session, clipboardWriter, vi.fn())).resolves.toBe(true)

        expect(clipboardWriter).toHaveBeenCalledOnce()
        expect(JSON.parse(clipboardWriter.mock.calls[0][0])).toMatchObject({
            edges: [edges[0]],
            nodes: [nodes[0], nodes[1]],
            version: 1,
        })
        expect(JSON.stringify(selection)).toBe(selectionBefore)
        expect(JSON.stringify({ edges, nodes })).toBe(sourceBefore)
    })

    it('reports clipboard failure without changing captured selection', async () => {
        const selection = supportedSelection()
        const clipboardError = new Error('Clipboard denied')
        const errorReporter = vi.fn()
        const clipboardWriter = vi.fn(async () => { throw clipboardError })

        await expect(copyDiagramSelection(
            selection,
            diagramCopySession(),
            clipboardWriter,
            errorReporter,
        )).resolves.toBe(false)

        expect(errorReporter).toHaveBeenCalledWith(clipboardError)
        expect(selection).toEqual(supportedSelection())
    })

    it('reports unsupported non-empty selection without writing clipboard', async () => {
        const unsupportedSelection = [{ objectId: 'one-two', objectKind: 'edge' as const }]
        const clipboardWriter = vi.fn(async () => undefined)
        const errorReporter = vi.fn()

        await expect(copyDiagramSelection(
            unsupportedSelection,
            diagramCopySession(),
            clipboardWriter,
            errorReporter,
        )).resolves.toBe(false)

        expect(clipboardWriter).not.toHaveBeenCalled()
        expect(errorReporter).toHaveBeenCalledWith(expect.objectContaining({message: 'Diagram selection cannot form a supported clipboard fragment'}))
    })
})
