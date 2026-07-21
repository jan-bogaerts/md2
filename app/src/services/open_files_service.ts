import type { ActionDefinition } from '../data/action_types'
import type { ProjectCard, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { register } from './service_injector'

export type OpenDocumentObject = ProjectCard | ActionDefinition

export interface ActionOpenDocument extends EventTarget {
    readonly kind: 'action'
    getObject(): ActionDefinition
}

export interface CardOpenDocument extends EventTarget {
    readonly kind: 'card'
    getObject(): ProjectCard
}

export type OpenDocument = ActionOpenDocument | CardOpenDocument

export interface OpenDocumentEventDetail {
    document: OpenDocument
}

export interface OpenFilesSnapshot {
    activeDocument: OpenDocument | null
    documents: readonly OpenDocument[]
}

interface OpenFilesDependencies {
    actionService: EventTarget & Pick<import('./actions/action_service').ActionService, 'getActions' | 'getDeletedDraftActions'>
    dataService: EventTarget & Pick<import('./data/data_service').DataService, 'getState'>
}

const EMPTY_SNAPSHOT: OpenFilesSnapshot = { activeDocument: null, documents: [] }

function isProjectCard(object: OpenDocumentObject): object is ProjectCard {
    return 'header' in object
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
    return isProjectCard(object) ? object.path : object.sourcePath
}

abstract class ManagedOpenDocumentBase<T extends OpenDocumentObject> extends EventTarget {
    abstract readonly kind: 'action' | 'card'
    readonly identity: string
    private object: T

    constructor(object: T) {
        super()
        this.identity = documentIdentity(object)
        this.object = object
    }

    getObject() {
        return this.object
    }

    renew(object: T) {
        if (this.identity !== documentIdentity(object)) {
            throw new Error(`Cannot renew open ${this.kind} document with a different object`)
        }
        if (this.object === object) return

        const previousObject = this.object
        this.object = object
        this.dispatchEvent(new CustomEvent('changed', { detail: { object, previousObject } }))
    }
}

class ManagedActionOpenDocument extends ManagedOpenDocumentBase<ActionDefinition> implements ActionOpenDocument {
    readonly kind = 'action' as const
}

class ManagedCardOpenDocument extends ManagedOpenDocumentBase<ProjectCard> implements CardOpenDocument {
    readonly kind = 'card' as const
}

type ManagedOpenDocument = ManagedActionOpenDocument | ManagedCardOpenDocument

function createManagedOpenDocument(object: OpenDocumentObject): ManagedOpenDocument {
    return isProjectCard(object) ? new ManagedCardOpenDocument(object) : new ManagedActionOpenDocument(object)
}

function renewManagedDocument(document: ManagedOpenDocument, object: OpenDocumentObject) {
    if (document.kind === 'card' && isProjectCard(object)) {
        document.renew(object)
        return
    }
    if (document.kind === 'action' && !isProjectCard(object)) {
        document.renew(object)
        return
    }

    throw new Error(`Cannot renew open ${document.kind} document with a different object kind`)
}

/** Tracks stable domain-document wrappers for list tabs. */
export class OpenFilesService extends EventTarget {
    private actionService: OpenFilesDependencies['actionService'] | null = null
    private dataService: OpenFilesDependencies['dataService'] | null = null
    private initialized = false
    private loadedProjectKey: string | null = null
    private snapshot = EMPTY_SNAPSHOT

    constructor() {
        super()
        register('openFilesService', this)
    }

    init(dependencies: OpenFilesDependencies) {
        if (this.initialized) return

        this.actionService = dependencies.actionService
        this.dataService = dependencies.dataService
        this.actionService.addEventListener('changed', this.handleActionChanged)
        this.dataService.addEventListener('changed', this.handleDataChanged)
        this.initialized = true
        this.reconcile()
    }

    getSnapshot(): OpenFilesSnapshot {
        return this.snapshot
    }

    openDocument(object: OpenDocumentObject): OpenDocument {
        const existing = this.findOpenDocument(object)
        if (existing) {
            renewManagedDocument(existing, object)
            this.activateDocument(existing)

            return existing
        }

        const document = createManagedOpenDocument(object)
        this.update({ activeDocument: document, documents: [...this.snapshot.documents, document] })
        this.dispatchDocumentEvent('added', document)

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
        this.dispatchDocumentEvent('removed', document)
    }

    clear() {
        if (this.snapshot.documents.length === 0) return

        const removedDocuments = this.snapshot.documents
        this.update(EMPTY_SNAPSHOT)
        for (const document of removedDocuments) this.dispatchDocumentEvent('removed', document)
    }

    private readonly handleActionChanged = () => this.reconcile()
    private readonly handleDataChanged = () => this.reconcile()

    private reconcile() {
        if (!this.actionService || !this.dataService) throw new Error('Open files service is not initialized')
        const { project } = this.dataService.getState()
        const nextProjectKey = projectKey(project)
        if (nextProjectKey !== this.loadedProjectKey) {
            this.loadedProjectKey = nextProjectKey
            this.clear()
        }
        const objects = this.currentObjects()
        const objectsByKey = new Map(objects.map((object) => [OpenFilesService.objectKey(object), object]))
        const removedDocuments: OpenDocument[] = []
        const documents = this.snapshot.documents.filter((document) => {
            const object = objectsByKey.get(OpenFilesService.documentKey(document))
            if (!object) {
                removedDocuments.push(document)
                return false
            }
            renewManagedDocument(document as ManagedOpenDocument, object)
            return true
        })
        if (removedDocuments.length === 0) return

        const activeDocument = this.snapshot.activeDocument && documents.includes(this.snapshot.activeDocument)
            ? this.snapshot.activeDocument
            : documents[0] ?? null
        this.update({ activeDocument, documents })
        for (const document of removedDocuments) this.dispatchDocumentEvent('removed', document)
    }

    private currentObjects() {
        if (!this.actionService || !this.dataService) throw new Error('Open files service is not initialized')
        const { snapshot } = this.dataService.getState()
        const actions = [...this.actionService.getActions(), ...this.actionService.getDeletedDraftActions()]

        return snapshotObjects(snapshot, actions)
    }

    private findOpenDocument(object: OpenDocumentObject) {
        const key = OpenFilesService.objectKey(object)

        return this.snapshot.documents.find((document) => OpenFilesService.documentKey(document) === key) as ManagedOpenDocument | undefined
    }

    private static objectKey(object: OpenDocumentObject) {
        const kind = isProjectCard(object) ? 'card' : 'action'

        return `${kind}:${documentIdentity(object)}`
    }

    private static documentKey(document: OpenDocument) {
        return `${document.kind}:${(document as ManagedOpenDocument).identity}`
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
