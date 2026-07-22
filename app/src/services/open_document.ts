import type { ActionDefinition, RawActionDefinition } from '../data/action_types'
import type { ProjectCard } from '../data/data_types'

export type OpenDocumentObject = ProjectCard | ActionDefinition
export type OpenDocumentDraft = ProjectCard | RawActionDefinition
export type OpenDocumentOrigin = object | string | null

export interface OpenDocumentSaveReference {
    readonly document: OpenDocument
    acknowledge(): void
}

export interface OpenDocumentChangedDetail {
    document: OpenDocument
    origin: OpenDocumentOrigin
    type: 'dirty' | 'draft' | 'renewed' | 'saved'
}

interface OpenDocumentBase<TObject extends OpenDocumentObject, TDraft extends OpenDocumentDraft> extends EventTarget {
    readonly dirty: boolean
    readonly kind: 'action' | 'card'
    readonly path: string
    createSaveReference(): OpenDocumentSaveReference
    getDraft(): TDraft
    getObject(): TObject
    replaceDraft(draft: TDraft): void
    updateDraft(draft: TDraft, origin?: OpenDocumentOrigin): void
}

export interface ActionOpenDocument extends OpenDocumentBase<ActionDefinition, RawActionDefinition> {
    readonly kind: 'action'
}

export interface CardOpenDocument extends OpenDocumentBase<ProjectCard, ProjectCard> {
    readonly kind: 'card'
}

export type OpenDocument = ActionOpenDocument | CardOpenDocument
