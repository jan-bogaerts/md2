import type { ProjectReference } from '../../data/data_types'
import { register } from '../service_injector'
import type { DiagramData } from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'

const DIRTY_CHANGED_EVENT = 'dirtyChanged'
const EDITABLE_DIAGRAM_CHANGED_EVENT = 'editableDiagramChanged'
const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged'
const SESSION_CHANGED_EVENT = 'sessionChanged'

export interface DiagramEditSessionSnapshot {
    sourceDiagramId: string
}

export interface OriginalDiagramSnapshot {
    diagram: DiagramData
    record: DiagramRecord
}

interface DiagramSourceService {
    getSourceSnapshot(): DiagramViewSourceSnapshot | null
    subscribeSource(listener: () => void): () => void
}

/** Owns original and editable model data for one project's active diagram edit session. */
export class DiagramEditSessionService extends EventTarget {
    private dirty = false
    private editableDiagram: DiagramData | null = null
    private originalDiagram: OriginalDiagramSnapshot | null = null
    private projectKey: string | null = null
    private session: DiagramEditSessionSnapshot | null = null
    private readonly sourceService: DiagramSourceService
    private unsubscribeSource: (() => void) | null = null

    constructor(sourceService: DiagramSourceService = diagramViewService) {
        super()
        this.sourceService = sourceService
    }

    getDirtySnapshot = () => this.dirty

    getEditableDiagramSnapshot = () => this.editableDiagram

    getOriginalDiagramSnapshot = () => this.originalDiagram

    getSessionSnapshot = () => this.session

    subscribeDirty = (listener: () => void) => this.subscribe(DIRTY_CHANGED_EVENT, listener)

    subscribeEditableDiagram = (listener: () => void) => this.subscribe(EDITABLE_DIAGRAM_CHANGED_EVENT, listener)

    subscribeOriginalDiagram = (listener: () => void) => this.subscribe(ORIGINAL_DIAGRAM_CHANGED_EVENT, listener)

    subscribeSession = (listener: () => void) => this.subscribe(SESSION_CHANGED_EVENT, listener)

    bindProject(project: ProjectReference) {
        const projectKey = `${project.id}:${project.branch}`
        if (projectKey === this.projectKey) return

        this.discard()
        this.unsubscribeSource?.()
        this.projectKey = projectKey
        this.unsubscribeSource = this.sourceService.subscribeSource(this.handleSourceChange)
    }

    clear() {
        this.discard()
        this.unsubscribeSource?.()
        this.unsubscribeSource = null
        this.projectKey = null
    }

    /** Starts a fresh session from canonical model data for the active diagram record. */
    start() {
        if (!this.projectKey) throw new Error('Diagram edit session is not bound to a project')
        const source = this.sourceService.getSourceSnapshot()
        if (!source) throw new Error('Cannot start a diagram edit session without an active diagram')

        const originalDiagram = { diagram: source.diagram, record: source.record }
        const editableDiagram = structuredClone(source.diagram)
        const session = { sourceDiagramId: source.record.id }
        this.publish({ dirty: false, editableDiagram, originalDiagram, session })
    }

    /** Ends the session and releases every session-owned reference. */
    discard() {
        this.publish({ dirty: false, editableDiagram: null, originalDiagram: null, session: null })
    }

    private readonly handleSourceChange = () => {
        if (!this.session) return
        const sourceDiagramId = this.sourceService.getSourceSnapshot()?.record.id ?? null
        if (sourceDiagramId !== this.session.sourceDiagramId) this.discard()
    }

    private publish(next: {
        dirty: boolean
        editableDiagram: DiagramData | null
        originalDiagram: OriginalDiagramSnapshot | null
        session: DiagramEditSessionSnapshot | null
    }) {
        const dirtyChanged = next.dirty !== this.dirty
        const editableDiagramChanged = next.editableDiagram !== this.editableDiagram
        const originalDiagramChanged = next.originalDiagram !== this.originalDiagram
        const sessionChanged = next.session !== this.session
        this.dirty = next.dirty
        this.editableDiagram = next.editableDiagram
        this.originalDiagram = next.originalDiagram
        this.session = next.session
        if (dirtyChanged) this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        if (editableDiagramChanged) this.dispatchEvent(new Event(EDITABLE_DIAGRAM_CHANGED_EVENT))
        if (originalDiagramChanged) this.dispatchEvent(new Event(ORIGINAL_DIAGRAM_CHANGED_EVENT))
        if (sessionChanged) this.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramEditSessionService = register('diagramEditSessionService', new DiagramEditSessionService())
