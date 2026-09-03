import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const firstRecord: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

class DiagramSourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null = null

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }

    setSource(source: DiagramViewSourceSnapshot | null) {
        this.source = source
        this.dispatchEvent(new Event('sourceChanged'))
    }
}

function createHarness() {
    const sourceService = new DiagramSourceStub()
    const service = new DiagramEditSessionService(sourceService)
    sourceService.setSource({ diagram, record: firstRecord })
    service.bindProject(project)

    return { service, sourceService }
}

describe('DiagramEditSessionService', () => {
    it('starts with immutable source references and one deep editable copy', () => {
        const { service } = createHarness()

        service.start()
        const original = service.getOriginalDiagramSnapshot()
        const editable = service.getEditableDiagramSnapshot()

        expect(original).toEqual({ diagram, record: firstRecord })
        expect(original?.diagram).toBe(diagram)
        expect(original?.record).toBe(firstRecord)
        expect(editable).toEqual(diagram)
        expect(editable).not.toBe(diagram)
        expect(editable?.nodes).not.toBe(diagram.nodes)

        editable!.nodes[0].label = 'Edited orders'
        expect(diagram.nodes[0].label).toBe('Orders')
        expect(original?.diagram.nodes[0].label).toBe('Orders')
        expect(service.getDirtySnapshot()).toBe(false)
    })

    it('exposes stable snapshots and notifies only changed values', () => {
        const { service } = createHarness()
        const dirtyListener = vi.fn()
        const editableListener = vi.fn()
        const originalListener = vi.fn()
        const sessionListener = vi.fn()
        service.subscribeDirty(dirtyListener)
        service.subscribeEditableDiagram(editableListener)
        service.subscribeOriginalDiagram(originalListener)
        service.subscribeSession(sessionListener)

        service.start()
        const editable = service.getEditableDiagramSnapshot()
        const original = service.getOriginalDiagramSnapshot()
        const session = service.getSessionSnapshot()
        expect(service.getEditableDiagramSnapshot()).toBe(editable)
        expect(service.getOriginalDiagramSnapshot()).toBe(original)
        expect(service.getSessionSnapshot()).toBe(session)
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(editableListener).toHaveBeenCalledOnce()
        expect(originalListener).toHaveBeenCalledOnce()
        expect(sessionListener).toHaveBeenCalledOnce()

        service.discard()
        service.discard()
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(editableListener).toHaveBeenCalledTimes(2)
        expect(originalListener).toHaveBeenCalledTimes(2)
        expect(sessionListener).toHaveBeenCalledTimes(2)
    })

    it('fails fast before project binding or without an active source diagram', () => {
        const sourceService = new DiagramSourceStub()
        const service = new DiagramEditSessionService(sourceService)

        expect(() => service.start()).toThrow('not bound to a project')
        service.bindProject(project)
        expect(() => service.start()).toThrow('without an active diagram')
    })

    it('keeps session for same source identity and discards it for another source', () => {
        const { service, sourceService } = createHarness()
        service.start()
        const session = service.getSessionSnapshot()

        sourceService.setSource({ diagram: structuredClone(diagram), record: { ...firstRecord } })
        expect(service.getSessionSnapshot()).toBe(session)

        const nextRecord = { ...firstRecord, id: 'diagram-2', path: 'design/diagrams/detail.json' }
        sourceService.setSource({ diagram: structuredClone(diagram), record: nextRecord })
        expect(service.getSessionSnapshot()).toBeNull()
        expect(service.getOriginalDiagramSnapshot()).toBeNull()
        expect(service.getEditableDiagramSnapshot()).toBeNull()
    })

    it('starts every session fresh and resets only when project identity changes', () => {
        const { service } = createHarness()
        service.start()
        const firstSession = service.getSessionSnapshot()
        service.getEditableDiagramSnapshot()!.nodes[0].label = 'Draft label'

        service.start()
        expect(service.getSessionSnapshot()).not.toBe(firstSession)
        expect(service.getEditableDiagramSnapshot()?.nodes[0].label).toBe('Orders')

        const secondSession = service.getSessionSnapshot()
        service.bindProject({ ...project })
        expect(service.getSessionSnapshot()).toBe(secondSession)

        service.bindProject({ ...project, branch: 'feature' })
        expect(service.getSessionSnapshot()).toBeNull()
    })

    it('unsubscribes from source navigation when cleared', () => {
        const { service, sourceService } = createHarness()
        service.start()
        service.clear()

        sourceService.setSource(null)
        expect(service.getSessionSnapshot()).toBeNull()
        expect(() => service.start()).toThrow('not bound to a project')
    })
})
