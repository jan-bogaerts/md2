import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramEdge, DiagramNode } from '../../services/diagrams/diagram_data'
import type { DiagramSelectionIdentity } from '../../services/diagrams/diagram_selection_service'
import { DiagramCutButton } from './diagram_cut_button'

const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])
const nodes: DiagramNode[] = [
    { id: 'one', label: 'One', role: 'focal' },
    { id: 'two', label: 'Two', role: 'backend' },
    { id: 'three', label: 'Three', role: 'store' },
]
const edges: DiagramEdge[] = [{ from: 'one', id: 'one-two', kind: 'connection', to: 'two' }]

class CutSelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = EMPTY_SELECTION

    readonly getSelectionSnapshot = () => this.selection

    readonly subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener)

        return () => this.removeEventListener('selection', listener)
    }

    select(...identities: DiagramSelectionIdentity[]) {
        this.selection = Object.freeze(identities)
        this.dispatchEvent(new Event('selection'))
    }
}

function cutSession() {
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

afterEach(() => cleanup())

describe('DiagramCutButton', () => {
    it('enables only supported selection and starts one cut with captured identities', async () => {
        const selection = new CutSelectionStub()
        const session = cutSession()
        const cutSelection = vi.fn(async () => true)
        render(<DiagramCutButton cutSelection={cutSelection} selection={selection} session={session} />)
        const button = screen.getByRole('button', { name: 'Cut' })

        expect(button).toBeDisabled()
        act(() => { selection.select({ objectId: 'one-two', objectKind: 'edge' }) })
        expect(button).toBeDisabled()
        act(() => {
            selection.select(
                { objectId: 'one', objectKind: 'node' },
                { objectId: 'two', objectKind: 'node' },
            )
        })
        expect(button).toBeEnabled()
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Cut selected diagram objects')

        fireEvent.click(button)

        expect(cutSelection).toHaveBeenCalledOnce()
        expect(cutSelection).toHaveBeenCalledWith(selection.getSelectionSnapshot(), session)
    })
})
