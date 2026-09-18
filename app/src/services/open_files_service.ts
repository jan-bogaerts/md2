import type { ActionDefinition } from '../data/action_types'
import type { Card, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { ACTIONS_CHANGED_EVENT, ACTION_DRAFT_CHANGED_EVENT } from './actions/action_service_events'
import { CARD_CHANGED_EVENT } from './data/card_events'
import type { CardChangedEventDetail } from './data/data_service'
import { register } from './service_injector'
import { ManagedOpenDocument } from './managed_open_document'
import {
    AGENT_INSTRUCTION_FILES_CHANGED_EVENT,
    agentInstructionFileEvent,
} from './agent_instructions/agent_instructions_service'
import type { AgentInstructionFile } from './agent_instructions/agent_instruction_file'
import type {
    CardOpenDocument,
    OpenDocument,
    CardBodyDraft,
    OpenDocumentChangedDetail,
    OpenDocumentDraft,
    OpenDocumentObject,
} from './open_document'

export type {
    ActionOpenDocument,
    CardOpenDocument,
    InstructionOpenDocument,
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
    agentInstructionsService?: EventTarget & Pick<import('./agent_instructions/agent_instructions_service').AgentInstructionsService, 'getSnapshot'>
    dataService: EventTarget & Pick<import('./data/data_service').DataService, 'getState'>
}

const EMPTY_SNAPSHOT: OpenFilesSnapshot = { activeDocument: null, documents: [] }

function isCard(object: OpenDocumentObject): object is Card {
    return 'header' in object
}

function isAction(object: OpenDocumentObject): object is ActionDefinition {
    return 'id' in object
}

function isInstruction(object: OpenDocumentObject): object is AgentInstructionFile {
    return 'path' in object && 'content' in object && !('header' in object)
}

function isCardDraft(draft: OpenDocumentDraft): draft is CardBodyDraft {
    return 'content' in draft
}

/** Cards are identified by their stable internal ID; regular markdown files have none and use their path. */
function documentIdentity(object: OpenDocumentObject) {
    if (isCard(object)) return object.header.internalId ?? object.path
    if (isAction(object)) return object.id

    return object.path
}

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}:${project.branch}` : null
}

function snapshotObjects(snapshot: ProjectSnapshot | null, actions: ActionDefinition[], instructions: readonly AgentInstructionFile[]) {
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

    return [...cards, ...actions, ...instructions]
}

function objectPath(object: OpenDocumentObject) {
    if (isCard(object)) return object.path
    if (isInstruction(object)) return object.path
    return object.sourcePath
}

type ManagedDocument = ManagedOpenDocument & OpenDocument

function renewManagedDocument(document: ManagedDocument, object: OpenDocumentObject, draft: OpenDocumentDraft) {
    if (document.kind === 'card' && isCard(object) && isCardDraft(draft)) {
        document.renew(documentIdentity(object), object, draft)
        return
    }
    if (document.kind === 'action' && !isCard(object) && !isCardDraft(draft)) {
        document.renew(documentIdentity(object), object, draft)
        return
    }
    if (document.kind === 'instruction' && isInstruction(object) && isCardDraft(draft)) {
        document.renew(documentIdentity(object), object, draft)
        return
    }

    throw new Error(`Cannot renew open ${document.kind} document with a different object kind`)
}

/** Owns canonical open documents and their list/board memberships. */
export class OpenFilesService extends EventTarget {
    private actionService: OpenFilesDependencies['actionService'] | null = null
    private agentInstructionsService: OpenFilesDependencies['agentInstructionsService'] | null = null
    private readonly boardDocuments = new Set<ManagedDocument>()
    private dataService: OpenFilesDependencies['dataService'] | null = null
    private readonly instructionEventPaths = new Set<string>()
    private readonly registeredDocuments = new Map<string, ManagedDocument>()
    private loadedProjectKey: string | null = null
    private registryScopeRevision = 0
    private snapshot = EMPTY_SNAPSHOT

    constructor() {
        super()
        register('openFilesService', this)
    }

    init(dependencies: OpenFilesDependencies) {
        if (
            this.actionService === dependencies.actionService
            && this.agentInstructionsService === dependencies.agentInstructionsService
            && this.dataService === dependencies.dataService
        ) return

        this.actionService?.removeEventListener(ACTIONS_CHANGED_EVENT, this.handleActionChanged)
        this.actionService?.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, this.handleActionChanged)
        this.dataService?.removeEventListener('changed', this.handleDataChanged)
        this.dataService?.removeEventListener(CARD_CHANGED_EVENT, this.handleCardChanged)
        this.removeInstructionListeners()
        this.clear()
        this.registryScopeRevision += 1
        this.actionService = dependencies.actionService
        this.agentInstructionsService = dependencies.agentInstructionsService ?? null
        this.dataService = dependencies.dataService
        this.loadedProjectKey = projectKey(this.dataService.getState().project)
        this.actionService.addEventListener(ACTIONS_CHANGED_EVENT, this.handleActionChanged)
        this.actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, this.handleActionChanged)
        this.dataService.addEventListener('changed', this.handleDataChanged)
        this.dataService.addEventListener(CARD_CHANGED_EVENT, this.handleCardChanged)
        this.agentInstructionsService?.addEventListener(AGENT_INSTRUCTION_FILES_CHANGED_EVENT, this.handleInstructionFilesChanged)
        this.syncInstructionListeners()
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

    openBoardDocument(object: Card): CardOpenDocument {
        // Board cards live in the working folder root, so they always carry a stable identity.
        if (!object.header.internalId) throw new Error(`Card identity was not added before opening: ${object.path}`)
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
        const removableDocuments = [...this.registeredDocuments.values()]
            .filter((document) => document.kind === 'instruction' || !document.dirty)
        this.boardDocuments.clear()
        if (this.snapshot.documents.length > 0) this.update(EMPTY_SNAPSHOT)
        for (const document of removableDocuments) this.removeDocument(document)
    }

    private readonly handleActionChanged = () => this.reconcile()
    private readonly handleInstructionChanged = () => this.reconcile()
    private readonly handleInstructionFilesChanged = () => {
        this.syncInstructionListeners()
        this.reconcile()
    }
    private readonly handleCardChanged = (event: Event) => {
        const { card } = (event as CustomEvent<CardChangedEventDetail>).detail
        const document = this.registeredDocuments.get(this.scopedObjectKey(card))
        if (!document) return
        if (!this.dataService) throw new Error('Open files service is not initialized')

        const { snapshot } = this.dataService.getState()
        const currentCard = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
            .find((candidate) => documentIdentity(candidate) === documentIdentity(card))
        if (!currentCard) throw new Error(`Cannot renew missing card document: ${card.path}`)

        renewManagedDocument(document, currentCard, { content: currentCard.content })
    }
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
                if (document.kind === 'instruction' || !document.dirty) this.removeDocument(document)
                continue
            }
            renewManagedDocument(document, object, this.draftForObject(object))
        }
    }

    private currentObjects() {
        if (!this.actionService || !this.dataService) throw new Error('Open files service is not initialized')
        const { snapshot } = this.dataService.getState()
        const actions = [...this.actionService.getActions(), ...this.actionService.draftStore.getDeletedDraftActions()]

        const instructions = this.agentInstructionsService?.getSnapshot().files ?? []

        return snapshotObjects(snapshot, actions, instructions)
    }

    private removeInstructionListeners() {
        if (!this.agentInstructionsService) return

        this.agentInstructionsService.removeEventListener(
            AGENT_INSTRUCTION_FILES_CHANGED_EVENT,
            this.handleInstructionFilesChanged,
        )
        for (const path of this.instructionEventPaths) {
            this.agentInstructionsService.removeEventListener(agentInstructionFileEvent(path), this.handleInstructionChanged)
        }
        this.instructionEventPaths.clear()
    }

    private syncInstructionListeners() {
        if (!this.agentInstructionsService) return

        const nextPaths = new Set(this.agentInstructionsService.getSnapshot().files.map(({ path }) => path))
        for (const path of this.instructionEventPaths) {
            if (nextPaths.has(path)) continue
            this.agentInstructionsService.removeEventListener(agentInstructionFileEvent(path), this.handleInstructionChanged)
            this.instructionEventPaths.delete(path)
        }
        for (const path of nextPaths) {
            if (this.instructionEventPaths.has(path)) continue
            this.agentInstructionsService.addEventListener(agentInstructionFileEvent(path), this.handleInstructionChanged)
            this.instructionEventPaths.add(path)
        }
    }

    private draftForObject(object: OpenDocumentObject): OpenDocumentDraft {
        if (isCard(object)) return { content: object.content }
        if (isInstruction(object)) return { content: object.content }
        if (!object.sourcePath) throw new Error(`Action document requires a source path: ${object.id}`)
        if (!this.actionService) throw new Error('Open files service is not initialized')

        return this.actionService.draftStore.getDraft(object.id).definition
    }

    private getOrCreateDocument(object: OpenDocumentObject): ManagedDocument {
        const key = this.scopedObjectKey(object)
        const existing = this.registeredDocuments.get(key)
        if (existing) {
            renewManagedDocument(existing, object, this.draftForObject(object))
            return existing
        }

        const draft = this.draftForObject(object)
        const kind = isCard(object) ? 'card' : isInstruction(object) ? 'instruction' : 'action'
        const document = new ManagedOpenDocument(kind, documentIdentity(object), object, draft) as ManagedDocument
        this.registeredDocuments.set(key, document)
        document.addEventListener('changed', this.handleDocumentChanged)
        this.dispatchDocumentEvent('added', document)

        return document
    }

    private readonly handleDocumentChanged = (event: Event) => {
        const detail = (event as CustomEvent<OpenDocumentChangedDetail>).detail
        this.releaseDocument(detail.document as ManagedDocument)
        if (detail.type === 'renewed' && this.snapshot.documents.includes(detail.document)) {
            this.update({ ...this.snapshot, documents: [...this.snapshot.documents] })
        }
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
        const kind = isCard(object) ? 'card' : isInstruction(object) ? 'instruction' : 'action'

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
