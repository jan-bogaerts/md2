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

function createRectangleHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    const nodeBoxes = {
        orders: { fanIn: 0, height: 20, width: 20, x: 10, y: 10 },
        store: { fanIn: 0, height: 20, width: 20, x: 100, y: 100 },
    }
    const groupBoxes = { backend: { height: 20, width: 20, x: 50, y: 50 } }
    const geometry = {
        getEdgeRouteSnapshot: (edgeId: string) => (
            edgeId === 'orders-store' ? [{ x: 0, y: 40 }, { x: 80, y: 40 }] : []
        ),
        getGroupGeometryFieldSnapshot: (groupId: string, field: 'height' | 'width' | 'x' | 'y') => (
            groupBoxes[groupId as keyof typeof groupBoxes]?.[field] ?? null
        ),
        getNodeGeometryFieldSnapshot: (
            nodeId: string,
            field: 'fanIn' | 'height' | 'width' | 'x' | 'y',
        ) => nodeBoxes[nodeId as keyof typeof nodeBoxes]?.[field] ?? null,
    }
    const selection = new DiagramSelectionService(session, geometry)
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

    it('deletes complete selection through one edit-session mutation batch', () => {
        const { selection, session } = createHarness()
        const changeIdsChanged = vi.fn()
        const selectionDuringNodePublication: DiagramSelectionIdentity[][] = []
        const selectionDuringEdgePublication: DiagramSelectionIdentity[][] = []
        const selectionDuringGroupPublication: DiagramSelectionIdentity[][] = []
        selection.replace([orders, edge, group])
        session.subscribeChangeIds(changeIdsChanged)
        session.subscribeCollectionMembership('node', () => {
            selectionDuringNodePublication.push([...selection.getSelectionSnapshot()])
        })
        session.subscribeCollectionMembership('edge', () => {
            selectionDuringEdgePublication.push([...selection.getSelectionSnapshot()])
        })
        session.subscribeCollectionMembership('group', () => {
            selectionDuringGroupPublication.push([...selection.getSelectionSnapshot()])
        })

        expect(selection.deleteSelection()).toBe(true)

        expect(selection.getSelectionSnapshot()).toEqual([])
        expect(session.getNodeIdsSnapshot()).toEqual(['store'])
        expect(session.getEdgeIdsSnapshot()).toEqual([])
        expect(session.getGroupIdsSnapshot()).toEqual([])
        expect(selectionDuringNodePublication).toEqual([[]])
        expect(selectionDuringEdgePublication).toEqual([[]])
        expect(selectionDuringGroupPublication).toEqual([[]])
        expect(changeIdsChanged).toHaveBeenCalledOnce()
        expect(selection.deleteSelection()).toBe(false)
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

    it('owns rectangle state and replaces selection with every intersecting selectable object', () => {
        const { selection, session } = createRectangleHarness()
        selection.replace([store, edge])
        const editableDiagram = session.getEditableDiagram()
        const ordersNode = session.getNodeSnapshot('orders')
        const transientGesture = session.getTransientGestureSnapshot()
        const viewportScale = session.getViewportScaleSnapshot()
        const rectangleChanged = vi.fn()
        const ordersChanged = vi.fn()
        const storeChanged = vi.fn()
        const edgeChanged = vi.fn()
        const groupChanged = vi.fn()
        selection.subscribeRectangle(rectangleChanged)
        selection.subscribeSelected(orders, ordersChanged)
        selection.subscribeSelected(store, storeChanged)
        selection.subscribeSelected(edge, edgeChanged)
        selection.subscribeSelected(group, groupChanged)

        selection.beginRectangleSelection({ x: 55, y: 55 })
        const initialRectangle = selection.getRectangleSnapshot()
        expect(initialRectangle).toEqual({ height: 0, width: 0, x: 55, y: 55 })
        expect(selection.updateRectangleSelection({ x: 5, y: 5 })).toBe(true)
        expect(selection.updateRectangleSelection({ x: 5, y: 5 })).toBe(false)
        expect(selection.completeRectangleSelection({ x: 5, y: 5 })).toBe(true)

        expect(selection.getRectangleSnapshot()).toBeNull()
        expect(selection.getSelectionSnapshot()).toEqual([orders, edge, group])
        expect(rectangleChanged).toHaveBeenCalledTimes(3)
        expect(ordersChanged).toHaveBeenCalledOnce()
        expect(storeChanged).toHaveBeenCalledOnce()
        expect(edgeChanged).not.toHaveBeenCalled()
        expect(groupChanged).toHaveBeenCalledOnce()
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getNodeSnapshot('orders')).toBe(ordersNode)
        expect(session.getTransientGestureSnapshot()).toBe(transientGesture)
        expect(session.getViewportScaleSnapshot()).toBe(viewportScale)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('clears selection for a zero-distance rectangle completion', () => {
        const { selection } = createRectangleHarness()
        selection.replace([orders])

        selection.beginRectangleSelection({ x: 20, y: 20 })
        selection.completeRectangleSelection({ x: 20, y: 20 })

        expect(selection.getRectangleSnapshot()).toBeNull()
        expect(selection.getSelectionSnapshot()).toEqual([])
    })

    it('cancels rectangle state without changing selection', () => {
        const { selection, session } = createRectangleHarness()
        selection.replace([store])
        const selectionSnapshot = selection.getSelectionSnapshot()

        selection.beginRectangleSelection({ x: 10, y: 10 })
        selection.updateRectangleSelection({ x: 30, y: 40 })
        expect(selection.cancelRectangleSelection()).toBe(true)

        expect(selection.getRectangleSnapshot()).toBeNull()
        expect(selection.getSelectionSnapshot()).toBe(selectionSnapshot)

        selection.beginRectangleSelection({ x: 10, y: 10 })
        session.setActiveTool('node:component')
        expect(selection.getRectangleSnapshot()).toBeNull()
        expect(selection.getSelectionSnapshot()).toBe(selectionSnapshot)
    })

    it('rejects non-finite rectangle coordinates and ignores completion without a start', () => {
        const { selection } = createRectangleHarness()

        expect(() => selection.beginRectangleSelection({ x: Number.NaN, y: 0 })).toThrow(
            'Diagram selection point coordinates must be finite',
        )
        expect(selection.completeRectangleSelection({ x: 10, y: 10 })).toBe(false)
    })
})
