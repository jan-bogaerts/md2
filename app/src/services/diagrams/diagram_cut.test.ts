import { describe, expect, it, vi } from 'vitest'
import type { DiagramEdge, DiagramNode } from './diagram_data'
import { canCutDiagramSelection, cutDiagramSelection } from './diagram_cut'
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

function diagramCutSession() {
    return {
        getEdgeIdsSnapshot: () => edges.map(({ id }) => id),
        getEdgeSnapshot: (edgeId: string) => edges.find(({ id }) => id === edgeId) ?? null,
        getFragmentIdsSnapshot: () => [],
        getFragmentSnapshot: () => null,
        getGroupSnapshot: () => null,
        getNodeIdsSnapshot: () => nodes.map(({ id }) => id),
        getNodeSnapshot: (nodeId: string) => nodes.find(({ id }) => id === nodeId) ?? null,
        removeObjects: vi.fn((identities: readonly DiagramSelectionIdentity[]) => identities.length > 0),
    }
}

function supportedSelection(): readonly DiagramSelectionIdentity[] {
    return Object.freeze([
        Object.freeze({ objectId: 'one', objectKind: 'node' as const }),
        Object.freeze({ objectId: 'two', objectKind: 'node' as const }),
    ])
}

describe('diagram cut', () => {
    it('writes serialized selection before deleting captured identities once', async () => {
        const session = diagramCutSession()
        const selection = supportedSelection()
        const order: string[] = []
        const clipboardWriter = vi.fn(async (content: string) => {
            order.push('write')
            expect(JSON.parse(content)).toMatchObject({
                edges: [edges[0]],
                nodes: [nodes[0], nodes[1]],
                version: 1,
            })
        })
        session.removeObjects.mockImplementation((identities) => {
            order.push('delete')
            expect(identities).toEqual(selection)

            return true
        })

        await expect(cutDiagramSelection(selection, session, clipboardWriter, vi.fn())).resolves.toBe(true)

        expect(order).toEqual(['write', 'delete'])
        expect(clipboardWriter).toHaveBeenCalledOnce()
        expect(session.removeObjects).toHaveBeenCalledOnce()
    })

    it('keeps diagram unchanged and reports error when clipboard write fails', async () => {
        const session = diagramCutSession()
        const clipboardError = new Error('Clipboard denied')
        const errorReporter = vi.fn()
        const clipboardWriter = vi.fn(async () => { throw clipboardError })

        await expect(cutDiagramSelection(supportedSelection(), session, clipboardWriter, errorReporter)).resolves.toBe(false)

        expect(errorReporter).toHaveBeenCalledWith(clipboardError)
        expect(session.removeObjects).not.toHaveBeenCalled()
    })

    it('rejects unsupported selection before clipboard or deletion', async () => {
        const session = diagramCutSession()
        const unsupportedSelection = [{ objectId: 'one-two', objectKind: 'edge' as const }]
        const clipboardWriter = vi.fn(async () => undefined)

        expect(canCutDiagramSelection(unsupportedSelection, session)).toBe(false)
        await expect(cutDiagramSelection(unsupportedSelection, session, clipboardWriter, vi.fn())).resolves.toBe(false)
        expect(clipboardWriter).not.toHaveBeenCalled()
        expect(session.removeObjects).not.toHaveBeenCalled()
    })
})
