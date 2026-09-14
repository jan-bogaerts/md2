import { describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramEdge } from './diagram_data'
import { DiagramEmphasisService, type DiagramEmphasisTarget } from './diagram_emphasis_service'

const diagram: DiagramData = {
    edges: [
        { from: 'a', id: 'a-b', kind: 'dependency', to: 'b' },
        { from: 'b', id: 'b-c', kind: 'dependency', to: 'c' },
        { from: 'a', id: 'a-a', kind: 'dependency', to: 'a' },
    ],
    groups: [],
    meta: { description: 'Relations', title: 'Relations', type: 'architecture', version: 1 },
    nodes: [
        { id: 'a', label: 'A', role: 'backend' },
        { id: 'b', label: 'B', role: 'backend' },
        { id: 'c', label: 'C', role: 'backend' },
    ],
}

class ViewStub extends EventTarget {
    source = { diagram, record: { actionId: 'action', id: 'diagram', label: 'Diagram', path: 'diagram.json' } }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('source', listener)

        return () => this.removeEventListener('source', listener)
    }

    replaceSource() {
        this.source = { ...this.source, diagram: structuredClone(this.source.diagram) }
        this.dispatchEvent(new Event('source'))
    }
}

class EditSessionStub extends EventTarget {
    editableDiagram: DiagramData | null = structuredClone(diagram)
    session: { sourceDiagramId: string } | null = { sourceDiagramId: 'diagram' }

    getEditableDiagram = () => this.editableDiagram

    getEdgeIdsSnapshot = () => this.editableDiagram?.edges.map(({ id }) => id) ?? []

    getSessionSnapshot = () => this.session

    subscribeCollectionMembership = (objectKind: string, listener: () => void) => {
        const eventType = `collection:${objectKind}`
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }

    subscribeEdgeField = (edgeId: string, field: keyof DiagramEdge, listener: () => void) => {
        const eventType = `edge:${edgeId}:${field}`
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }

    subscribeSession = (listener: () => void) => {
        this.addEventListener('session', listener)

        return () => this.removeEventListener('session', listener)
    }

    setEdgeEndpoint(edgeId: string, field: 'from' | 'to', value: string) {
        const edge = this.editableDiagram?.edges.find(({ id }) => id === edgeId)
        if (!edge) throw new Error(`Missing edge: ${edgeId}`)
        edge[field] = value
        this.dispatchEvent(new Event(`edge:${edgeId}:${field}`))
    }

    addEdge(edge: DiagramEdge) {
        if (!this.editableDiagram) return
        this.editableDiagram.edges.push(edge)
        this.dispatchEvent(new Event('collection:edge'))
    }

    deleteEdge(edgeId: string) {
        if (!this.editableDiagram) return
        this.editableDiagram.edges = this.editableDiagram.edges.filter(({ id }) => id !== edgeId)
        this.dispatchEvent(new Event('collection:edge'))
    }

    deleteNode(nodeId: string) {
        if (!this.editableDiagram) return
        this.editableDiagram.nodes = this.editableDiagram.nodes.filter(({ id }) => id !== nodeId)
        this.dispatchEvent(new Event('collection:node'))
    }

    end() {
        this.editableDiagram = null
        this.session = null
        this.dispatchEvent(new Event('session'))
    }
}

function target(objectKind: 'edge' | 'node', objectId: string, surface: 'current' | 'new' = 'current'): DiagramEmphasisTarget {
    return { diagramId: 'diagram', objectId, objectKind, surface }
}

describe('DiagramEmphasisService', () => {
    it('retains only one-hop objects for a node, including a self-loop once', () => {
        const service = new DiagramEmphasisService(new ViewStub(), new EditSessionStub())

        service.emphasize(target('node', 'a'))

        expect(service.getDimmedSnapshot('current', 'node', 'a')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'node', 'b')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'node', 'c')).toBe(true)
        expect(service.getDimmedSnapshot('current', 'edge', 'a-b')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'edge', 'a-a')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'edge', 'b-c')).toBe(true)
    })

    it('retains only an emphasized edge and its endpoints', () => {
        const service = new DiagramEmphasisService(new ViewStub(), new EditSessionStub())

        service.emphasize(target('edge', 'b-c'))

        expect(service.getDimmedSnapshot('current', 'edge', 'b-c')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'edge', 'a-b')).toBe(true)
        expect(service.getDimmedSnapshot('current', 'node', 'b')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'node', 'c')).toBe(false)
        expect(service.getDimmedSnapshot('current', 'node', 'a')).toBe(true)
    })

    it('moves an active target and publishes only changed object snapshots', () => {
        const service = new DiagramEmphasisService(new ViewStub(), new EditSessionStub())
        const aChanged = vi.fn()
        const cChanged = vi.fn()
        service.subscribeDimmed('current', 'node', 'a', aChanged)
        service.subscribeDimmed('current', 'node', 'c', cChanged)
        service.emphasize(target('node', 'a'))
        aChanged.mockClear()
        cChanged.mockClear()

        expect(service.moveTargetIfActive(target('edge', 'b-c'))).toBe(true)

        expect(aChanged).toHaveBeenCalledOnce()
        expect(cChanged).toHaveBeenCalledOnce()
    })

    it('moves active emphasis between Current and New surfaces', () => {
        const service = new DiagramEmphasisService(new ViewStub(), new EditSessionStub())
        service.emphasize(target('node', 'a'))

        expect(service.moveTargetIfActive(target('node', 'c', 'new'))).toBe(true)

        expect(service.getTargetSnapshot()).toEqual(target('node', 'c', 'new'))
        expect(service.getDimmedSnapshot('current', 'node', 'c')).toBe(false)
        expect(service.getDimmedSnapshot('new', 'node', 'a')).toBe(true)
    })

    it('recomputes New relations after endpoint changes and clears deleted targets', () => {
        const view = new ViewStub()
        const editSession = new EditSessionStub()
        const service = new DiagramEmphasisService(view, editSession)
        service.start()
        service.emphasize(target('node', 'a', 'new'))

        editSession.setEdgeEndpoint('a-b', 'from', 'c')
        expect(service.getDimmedSnapshot('new', 'edge', 'a-b')).toBe(true)
        expect(service.getDimmedSnapshot('new', 'node', 'b')).toBe(true)

        editSession.deleteNode('a')
        expect(service.getTargetSnapshot()).toBeNull()
    })

    it('recomputes New relations after edge addition and removal', () => {
        const editSession = new EditSessionStub()
        const service = new DiagramEmphasisService(new ViewStub(), editSession)
        service.start()
        service.emphasize(target('node', 'a', 'new'))
        expect(service.getDimmedSnapshot('new', 'node', 'c')).toBe(true)

        editSession.addEdge({ from: 'a', id: 'a-c', kind: 'dependency', to: 'c' })
        expect(service.getDimmedSnapshot('new', 'node', 'c')).toBe(false)
        expect(service.getDimmedSnapshot('new', 'edge', 'a-c')).toBe(false)

        editSession.deleteEdge('a-c')
        expect(service.getDimmedSnapshot('new', 'node', 'c')).toBe(true)
    })

    it('clears Current on source replacement and New when edit session ends', () => {
        const view = new ViewStub()
        const editSession = new EditSessionStub()
        const service = new DiagramEmphasisService(view, editSession)
        service.start()
        service.emphasize(target('node', 'a'))

        view.replaceSource()
        expect(service.getTargetSnapshot()).toBeNull()

        service.emphasize(target('node', 'a', 'new'))
        editSession.end()
        expect(service.getTargetSnapshot()).toBeNull()
    })
})
