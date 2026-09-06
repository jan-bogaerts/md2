import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
    type ReadonlyDiagramData,
} from './diagram_edit_session_service'
import { parseDiagramData, serializeDiagramData, type DiagramData } from './diagram_data'
import {
    diagramViewService,
    type DiagramViewService,
    type SaveEditedDiagramCopyRequest,
} from './diagram_view_service'

const SAVE_STATUS_CHANGED_EVENT = 'diagramSaveStatusChanged'

export type DiagramSaveStatus = 'idle' | 'saving'

type DiagramSaveSession = Pick<DiagramEditSessionService,
    | 'acknowledgeSavedCopy'
    | 'getDirtySnapshot'
    | 'getEditableDiagram'
    | 'getOriginalDiagramSnapshot'
    | 'getSavedRecordSnapshot'
    | 'getSessionSnapshot'
>

type DiagramCopyPersistence = Pick<DiagramViewService, 'saveEditedDiagramCopy'>
type DiagramSerializer = (diagram: ReadonlyDiagramData) => string

function canonicalDiagramContent(diagram: ReadonlyDiagramData) {
    return serializeDiagramData(diagram as DiagramData)
}

/** Owns explicit edited-diagram save progress and coordinates session acknowledgement. */
export class DiagramSaveService extends EventTarget {
    private readonly persistence: DiagramCopyPersistence
    private readonly serialize: DiagramSerializer
    private readonly session: DiagramSaveSession
    private status: DiagramSaveStatus = 'idle'

    constructor(
        session: DiagramSaveSession = diagramEditSessionService,
        persistence: DiagramCopyPersistence = diagramViewService,
        serialize: DiagramSerializer = canonicalDiagramContent,
    ) {
        super()
        this.persistence = persistence
        this.serialize = serialize
        this.session = session
    }

    getStatusSnapshot = () => this.status

    subscribeStatus = (listener: () => void) => {
        this.addEventListener(SAVE_STATUS_CHANGED_EVENT, listener)

        return () => this.removeEventListener(SAVE_STATUS_CHANGED_EVENT, listener)
    }

    async save() {
        if (this.status === 'saving') throw new Error('Diagram save is already in progress')
        if (!this.session.getDirtySnapshot()) throw new Error('Cannot save a diagram without changes')
        const editableDiagram = this.session.getEditableDiagram()
        const originalDiagram = this.session.getOriginalDiagramSnapshot()
        const editSession = this.session.getSessionSnapshot()
        if (!editableDiagram || !originalDiagram || !editSession) throw new Error('Cannot save without an active diagram edit session')

        const content = this.serialize(editableDiagram)
        const savedDiagram = parseDiagramData(content)
        const request: SaveEditedDiagramCopyRequest = {
            content,
            savedRecord: this.session.getSavedRecordSnapshot(),
            sourceRecord: originalDiagram.record,
        }
        this.setStatus('saving')
        try {
            const record = await this.persistence.saveEditedDiagramCopy(request)
            const currentSession = this.session.getSessionSnapshot()
            if (currentSession?.sourceDiagramId === editSession.sourceDiagramId) {
                const currentDiagram = this.session.getEditableDiagram()
                const savedDataIsCurrent = !!currentDiagram && this.serialize(currentDiagram) === content
                this.session.acknowledgeSavedCopy(record, savedDiagram, savedDataIsCurrent)
            }

            return record
        } finally {
            this.setStatus('idle')
        }
    }

    private setStatus(status: DiagramSaveStatus) {
        if (status === this.status) return

        this.status = status
        this.dispatchEvent(new Event(SAVE_STATUS_CHANGED_EVENT))
    }
}

export const diagramSaveService = register('diagramSaveService', new DiagramSaveService())
