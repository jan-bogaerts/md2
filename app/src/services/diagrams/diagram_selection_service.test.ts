import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramSelectionService, type DiagramSelectionIdentity } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }
const orders: DiagramSelectionIdentity = { objectId: 'orders', objectKind: 'node' }
const store: DiagramSelectionIdentity = { objectId: 'store', objectKind: 'node' }
const edge: DiagramSelectionIdentity = { objectId: 'orders-store', objectKind: 'edge' }
const group: DiagramSelectionIdentity = { objectId: 'backend', objectKind: 'group' }

class DiagramSourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    const selection = new DiagramSelectionService(session)
    session.bindProject(project)
    session.start()

    return { selection, session }
}

describe('DiagramSelectionService', () => {
    it('replaces, adds, removes, toggles, clears, and queries mixed object identities', () => {
        const { selection, session } = createHarness()
        const editableDiagram = session.getEditableDiagram()
        const ordersNode = session.getNodeSnapshot('orders')

        expect(selection.replace([orders])).toBe(true)
        expect(selection.isSelected(orders)).toBe(true)
        expect(selection.add(edge)).toBe(true)
        expect(selection.add(edge)).toBe(false)
        expect(selection.getSelectionSnapshot()).toEqual([orders, edge])

        expect(selection.remove(orders)).toBe(true)
        expect(selection.remove(orders)).toBe(false)
        expect(selection.toggle(group)).toBe(true)
        expect(selection.toggle(edge)).toBe(true)
        expect(selection.getSelectionSnapshot()).toEqual([group])
        expect(selection.getSelectedSnapshot(group)).toBe(true)

        expect(selection.clear()).toBe(true)
        expect(selection.clear()).toBe(false)
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getNodeSnapshot('orders')).toBe(ordersNode)
    })

    it('keeps snapshots stable for no-ops and publishes only changed identity scopes', () => {
        const { selection } = createHarness()
        selection.replace([orders, edge])
        const snapshot = selection.getSelectionSnapshot()
        const ordersChangedOne = vi.fn()
        const ordersChangedTwo = vi.fn()
        const storeChanged = vi.fn()
        const edgeChanged = vi.fn()
        const membershipChanged = vi.fn()
        selection.subscribeSelected(orders, ordersChangedOne)
        selection.subscribeSelected(orders, ordersChangedTwo)
        selection.subscribeSelected(store, storeChanged)
        selection.subscribeSelected(edge, edgeChanged)
        selection.subscribeSelection(membershipChanged)

        expect(selection.replace([edge, orders, orders])).toBe(false)
        expect(selection.getSelectionSnapshot()).toBe(snapshot)
        expect(membershipChanged).not.toHaveBeenCalled()

        expect(selection.replace([store, edge])).toBe(true)
        expect(ordersChangedOne).toHaveBeenCalledOnce()
        expect(ordersChangedTwo).toHaveBeenCalledOnce()
        expect(storeChanged).toHaveBeenCalledOnce()
        expect(edgeChanged).not.toHaveBeenCalled()
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('rejects missing identities and selection without an active edit session', () => {
        const session = new DiagramEditSessionService(new DiagramSourceStub())
        const selection = new DiagramSelectionService(session)

        expect(() => selection.add(orders)).toThrow('without an active edit session')
        session.bindProject(project)
        session.start()
        expect(() => selection.add({ objectId: 'missing', objectKind: 'node' })).toThrow(
            'Diagram node missing does not exist',
        )
        expect(selection.getSelectionSnapshot()).toEqual([])
    })

    it('clears selection when the edit session restarts or ends', () => {
        const { selection, session } = createHarness()
        const membershipChanged = vi.fn()
        selection.subscribeSelection(membershipChanged)
        selection.replace([orders, edge])
        membershipChanged.mockClear()

        session.start()
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(membershipChanged).toHaveBeenCalledOnce()

        selection.add(group)
        membershipChanged.mockClear()
        session.discard()
        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('prunes deleted and cascaded identities before collection membership publication', () => {
        const { selection, session } = createHarness()
        selection.replace([orders, edge, group])
        const selectionDuringNodePublication: DiagramSelectionIdentity[][] = []
        const selectionDuringEdgePublication: DiagramSelectionIdentity[][] = []
        const selectionDuringGroupPublication: DiagramSelectionIdentity[][] = []
        session.subscribeCollectionMembership('node', () => {
            selectionDuringNodePublication.push([...selection.getSelectionSnapshot()])
        })
        session.subscribeCollectionMembership('edge', () => {
            selectionDuringEdgePublication.push([...selection.getSelectionSnapshot()])
        })
        session.subscribeCollectionMembership('group', () => {
            selectionDuringGroupPublication.push([...selection.getSelectionSnapshot()])
        })

        expect(session.removeNode('orders')).toBe(true)
        expect(selectionDuringNodePublication).toEqual([[group]])
        expect(selectionDuringEdgePublication).toEqual([[group]])
        expect(selection.getSelectionSnapshot()).toEqual([group])

        expect(session.removeGroup('backend')).toBe(true)
        expect(selectionDuringGroupPublication).toEqual([[]])
        expect(selection.getSelectionSnapshot()).toEqual([])
    })
})
