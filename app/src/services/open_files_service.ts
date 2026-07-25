import type { ActionDefinition } from '../data/action_types'
import type { ProjectCard, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { ACTIONS_CHANGED_EVENT, ACTION_DRAFT_CHANGED_EVENT } from './actions/action_service_events'
import { register } from './service_injector'
import { ManagedOpenDocument } from './managed_open_document'
import type {
    CardOpenDocument,
    OpenDocument,
    OpenDocumentDraft,
    OpenDocumentObject,
} from './open_document'

export type {
    ActionOpenDocument,
    CardOpenDocument,
    OpenDocument,
    OpenDocumentChangedDetail,
    OpenDocumentDraft,
    OpenDocumentObject,
    OpenDocumentOrigin,
    OpenDocumentSaveReference,
} from './open_document'

export interface OpenDocumentEventDetail {
    document: OpenDocument
}

export interface OpenFilesSnapshot {
    activeDocument: OpenDocument | null
    documents: readonly OpenDocument[]
}

interface OpenFilesDependencies {
    actionService: EventTarget & Pick<import('./actions/action_service').ActionService, 'getActions' | 'draftStore'>
    dataService: EventTarget & Pick<import('./data/data_service').DataService, 'getState'>
}

const EMPTY_SNAPSHOT: OpenFilesSnapshot = { activeDocument: null, documents: [] }

function isProjectCard(object: OpenDocumentObject): object is ProjectCard {
    return 'header' in object
}

function isCardDraft(draft: OpenDocumentDraft): draft is ProjectCard {
    return 'header' in draft
}

function documentIdentity(object: OpenDocumentObject) {
    if (!isProjectCard(object)) return object.id
    if (!object.header.internalId) throw new Error(`Card identity was not added before opening: ${object.path}`)

    return object.header.internalId
}

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}:${project.branch}` : null
}

function snapshotObjects(snapshot: ProjectSnapshot | null, actions: ActionDefinition[]) {
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

    return [...cards, ...actions]
}

function objectPath(object: OpenDocumentObject) {
    if (isProjectCard(object)) return object.path
    return object.sourcePath
}

type ManagedDocument = ManagedOpenDocument & OpenDocument

function renewManagedDocument(document: ManagedDocument, object: OpenDocumentObject, draft: OpenDocumentDraft) {
    if (document.kind === 'card' && isProjectCard(object) && isCardDraft(draft)) {
        document.renew(documentIdentity(object), object, draft)
        return
    }
    if (document.kind === 'action' && !isProjectCard(object) && !isCardDraft(draft)) {
        document.renew(documentIdentity(object), object, draft)
        return
    }

    throw new Error(`Cannot renew open ${document.kind} document with a different object kind`)
}

/** Owns canonical open documents and their list/board memberships. */
export class OpenFilesService extends EventTarget {
    private actionService: OpenFilesDependencies['actionService'] | null = null
    private readonly boardDocuments = new Set<ManagedDocument>()
    private dataService: OpenFilesDependencies['dataService'] | null = null
    private readonly registeredDocuments = new Map<string, ManagedDocument>()
    private loadedProjectKey: string | null = null
    private registryScopeRevision = 0
    private snapshot = EMPTY_SNAPSHOT

    constructor() {
        super()
        register('openFilesService', this)
    }

    init(dependencies: OpenFilesDependencies) {
        if (this.actionService === dependencies.actionService && this.dataService === dependencies.dataService) return

        this.actionService?.removeEventListener(ACTIONS_CHANGED_EVENT, this.handleActionChanged)
        this.actionService?.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, this.handleActionChanged)
        this.dataService?.removeEventListener('changed', this.handleDataChanged)
        this.clear()
        this.registryScopeRevision += 1
        this.actionService = dependencies.actionService
        this.dataService = dependencies.dataService
        this.loadedProjectKey = projectKey(this.dataService.getState().project)
        this.actionService.addEventListener(ACTIONS_CHANGED_EVENT, this.handleActionChanged)
        this.actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, this.handleActionChanged)
        this.dataService.addEventListener('changed', this.handleDataChanged)
        this.reconcile()
    }

    getSnapshot(): OpenFilesSnapshot {
        return this.snapshot
    }

    getRegisteredDocuments(): readonly OpenDocument[] {
        return [...this.registeredDocuments.values()]
    }

    findDocument(object: OpenDocumentObject): OpenDocument | null {
        return this.registeredDocuments.get(this.scopedObjectKey(object)) ?? null
    }

    openDocument(object: OpenDocumentObject): OpenDocument {
        const document = this.getOrCreateDocument(object)
        if (!this.snapshot.documents.includes(document)) {
            this.update({ activeDocument: document, documents: [...this.snapshot.documents, document] })
        } else {
            this.activateDocument(document)
        }

        return document
    }

    openBoardDocument(object: ProjectCard): CardOpenDocument {
        const document = this.getOrCreateDocument(object)
        if (document.kind !== 'card') throw new Error('Board view can only open card documents')

        this.boardDocuments.add(document)

        return document
    }

    openPath(path: string): OpenDocument {
        const object = this.currentObjects().find((candidate) => objectPath(candidate) === path)
        if (!object) throw new Error(`Cannot open unknown document: ${path}`)

        return this.openDocument(object)
    }

    activateDocument(document: OpenDocument) {
        if (!this.snapshot.documents.includes(document) || this.snapshot.activeDocument === document) return

        this.update({ ...this.snapshot, activeDocument: document })
    }

    closeDocument(document: OpenDocument) {
        const index = this.snapshot.documents.indexOf(document)
        if (index === -1) return

        const documents = this.snapshot.documents.filter((candidate) => candidate !== document)
        const activeDocument = this.snapshot.activeDocument === document
            ? documents[index] ?? documents[index - 1] ?? null
            : this.snapshot.activeDocument
        this.update({ activeDocument, documents })
        this.releaseDocument(document as ManagedDocument)
    }

    closeBoardDocument(document: CardOpenDocument) {
        this.boardDocuments.delete(document as ManagedDocument)
        this.releaseDocument(document as ManagedDocument)
    }

    discardDocument(document: OpenDocument) {
        const managedDocument = document as ManagedDocument
        this.boardDocuments.delete(managedDocument)
        const documents = this.snapshot.documents.filter((candidate) => candidate !== document)
        const activeDocument = this.snapshot.activeDocument === document ? documents[0] ?? null : this.snapshot.activeDocument
        if (documents.length !== this.snapshot.documents.length) this.update({ activeDocument, documents })
        this.removeDocument(managedDocument)
    }

    clear() {
        const cleanDocuments = [...this.registeredDocuments.values()].filter((document) => !document.dirty)
        this.boardDocuments.clear()
        if (this.snapshot.documents.length > 0) this.update(EMPTY_SNAPSHOT)
        for (const document of cleanDocuments) this.removeDocument(document)
    }

    private readonly handleActionChanged = () => this.reconcile()
    private readonly handleDataChanged = () => this.reconcile()

    private reconcile() {
        if (!this.actionService || !this.dataService) throw new Error('Open files service is not initialized')
        const { project } = this.dataService.getState()
        const nextProjectKey = projectKey(project)
        if (nextProjectKey !== this.loadedProjectKey) {
            this.loadedProjectKey = nextProjectKey
            this.registryScopeRevision += 1
            this.clear()
        }
        const objects = this.currentObjects()
        const objectsByKey = new Map(objects.map((object) => [this.scopedObjectKey(object), object]))
        for (const [key, document] of this.registeredDocuments) {
            const object = objectsByKey.get(key)
            if (!object) {
                if (!document.dirty) this.removeDocument(document)
                continue
            }
            renewManagedDocument(document, object, this.draftForObject(object))
        }
    }

    private currentObjects() {
        if (!this.actionService || !this.dataService) throw new Error('Open files service is not initialized')
        const { snapshot } = this.dataService.getState()
        const actions = [...this.actionService.getActions(), ...this.actionService.draftStore.getDeletedDraftActions()]

        return snapshotObjects(snapshot, actions)
    }

    private draftForObject(object: OpenDocumentObject): OpenDocumentDraft {
        if (isProjectCard(object)) return object
        if (!object.sourcePath) throw new Error(`Action document requires a source path: ${object.id}`)
        if (!this.actionService) throw new Error('Open files service is not initialized')

        return this.actionService.draftStore.getDraft(object.sourcePath).definition
    }

    private getOrCreateDocument(object: OpenDocumentObject): ManagedDocument {
        const key = this.scopedObjectKey(object)
        const existing = this.registeredDocuments.get(key)
        if (existing) {
            renewManagedDocument(existing, object, this.draftForObject(object))
            return existing
        }

        const draft = this.draftForObject(object)
        const kind = isProjectCard(object) ? 'card' : 'action'
        const document = new ManagedOpenDocument(kind, documentIdentity(object), object, draft) as ManagedDocument
        this.registeredDocuments.set(key, document)
        document.addEventListener('changed', this.handleDocumentChanged)
        this.dispatchDocumentEvent('added', document)

        return document
    }

    private readonly handleDocumentChanged = (event: Event) => {
        const detail = (event as CustomEvent<{ document: OpenDocument }>).detail
        this.releaseDocument(detail.document as ManagedDocument)
        this.dispatchEvent(new CustomEvent('documentChanged', { detail }))
    }

    private releaseDocument(document: ManagedDocument) {
        if (document.dirty || this.boardDocuments.has(document) || this.snapshot.documents.includes(document)) return

        this.removeDocument(document)
    }

    private removeDocument(document: ManagedDocument) {
        const entry = [...this.registeredDocuments.entries()].find(([, candidate]) => candidate === document)
        if (!entry) return

        document.removeEventListener('changed', this.handleDocumentChanged)
        this.registeredDocuments.delete(entry[0])
        this.boardDocuments.delete(document)
        if (this.snapshot.documents.includes(document)) {
            const documents = this.snapshot.documents.filter((candidate) => candidate !== document)
            const activeDocument = this.snapshot.activeDocument === document ? documents[0] ?? null : this.snapshot.activeDocument
            this.update({ activeDocument, documents })
        }
        this.dispatchDocumentEvent('removed', document)
    }

    private static objectKey(object: OpenDocumentObject) {
        const kind = isProjectCard(object) ? 'card' : 'action'

        return `${kind}:${documentIdentity(object)}`
    }

    private scopedObjectKey(object: OpenDocumentObject) {
        return `${this.registryScopeRevision}:${OpenFilesService.objectKey(object)}`
    }

    private dispatchDocumentEvent(name: 'added' | 'removed', document: OpenDocument) {
        this.dispatchEvent(new CustomEvent<OpenDocumentEventDetail>(name, { detail: { document } }))
    }

    private update(snapshot: OpenFilesSnapshot) {
        if (snapshot.activeDocument === this.snapshot.activeDocument && snapshot.documents === this.snapshot.documents) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<OpenFilesSnapshot>('changed', { detail: snapshot }))
    }
}

export const openFilesService = new OpenFilesService()
