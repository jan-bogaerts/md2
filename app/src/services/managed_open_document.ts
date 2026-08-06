import type {
    CardBodyDraft,
    OpenDocument,
    OpenDocumentChangedDetail,
    OpenDocumentDraft,
    OpenDocumentObject,
    OpenDocumentOrigin,
    OpenDocumentSaveReference,
} from './open_document'

function isCardDraft(draft: OpenDocumentDraft): draft is CardBodyDraft {
    return 'content' in draft
}

function isCardObject(object: OpenDocumentObject) {
    return 'header' in object
}

function objectPath(object: OpenDocumentObject) {
    if (isCardObject(object)) return object.path
    if (!object.sourcePath) throw new Error(`Action document requires a source path: ${object.id}`)

    return object.sourcePath
}

/** Stable document identity with revision-based draft persistence state. */
export class ManagedOpenDocument extends EventTarget {
    readonly identity: string
    readonly kind: 'action' | 'card'
    private acknowledgedRevision = 0
    private draft: OpenDocumentDraft
    private editRevision = 0
    private object: OpenDocumentObject

    constructor(
        kind: 'action' | 'card',
        identity: string,
        object: OpenDocumentObject,
        draft: OpenDocumentDraft,
    ) {
        super()
        this.kind = kind
        this.identity = identity
        this.object = object
        this.draft = draft
    }

    get dirty() { return this.editRevision !== this.acknowledgedRevision }
    get path() { return objectPath(this.object) }

    getDraft() {
        return this.draft
    }

    getObject() {
        return this.object
    }

    updateDraft(draft: OpenDocumentDraft, origin: OpenDocumentOrigin = null) {
        if (this.draft === draft) return

        const wasDirty = this.dirty
        this.applyDraft(draft)
        this.editRevision += 1
        this.dispatchChanged('draft', origin)
        if (!wasDirty) this.dispatchChanged('dirty', origin)
    }

    replaceDraft(draft: OpenDocumentDraft) {
        const wasDirty = this.dirty
        this.applyDraft(draft)
        this.editRevision += 1
        this.acknowledgedRevision = this.editRevision
        this.dispatchChanged('draft', null)
        if (wasDirty) this.dispatchChanged('dirty', null)
    }

    createSaveReference(): OpenDocumentSaveReference {
        const revision = this.editRevision

        return { document: this as unknown as OpenDocument, acknowledge: () => this.acknowledge(revision) }
    }

    renew(identity: string, object: OpenDocumentObject, draft: OpenDocumentDraft) {
        if (this.identity !== identity) throw new Error(`Cannot renew open ${this.kind} document with a different object`)
        const sameDraft = this.kind === 'card'
            ? isCardDraft(this.draft) && isCardDraft(draft) && this.draft.content === draft.content
            : this.draft === draft
        if (this.object === object && sameDraft) return

        const previousObject = this.object
        const draftChanged = !this.dirty && !sameDraft
        this.object = object
        if (draftChanged) this.draft = draft
        const detail = { document: this, object, origin: null, previousObject, type: 'renewed' }
        this.dispatchEvent(new CustomEvent('changed', { detail }))
        if (draftChanged) this.dispatchChanged('draft', null)
    }

    private acknowledge(revision: number) {
        if (revision <= this.acknowledgedRevision) return

        const wasDirty = this.dirty
        this.acknowledgedRevision = revision
        this.dispatchChanged('saved', null)
        if (wasDirty && !this.dirty) this.dispatchChanged('dirty', null)
    }

    private applyDraft(draft: OpenDocumentDraft) {
        if (this.kind === 'card') {
            if (!isCardObject(this.object) || !('content' in draft)) throw new Error('Cannot update card document with a different draft kind')
            this.draft = draft
            return
        }

        this.draft = draft
    }

    private dispatchChanged(type: OpenDocumentChangedDetail['type'], origin: OpenDocumentOrigin) {
        const detail: OpenDocumentChangedDetail = { document: this as unknown as OpenDocument, origin, type }
        this.dispatchEvent(new CustomEvent<OpenDocumentChangedDetail>('changed', { detail }))
    }
}
