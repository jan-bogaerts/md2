import type { ActionEditorState, RawActionDefinition } from '../../data/action_types'
import type { ActionService } from '../../services/actions/action_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService, type OpenDocumentChangedDetail } from '../../services/open_files_service'
import {
    MarkdownDataSourceBase,
    type ActionMarkdownSection,
    type MarkdownBindingKind,
    type MarkdownDocumentTarget,
} from './markdown_data_source'

type ActionMarkdownTarget = Extract<MarkdownDocumentTarget, { section: ActionMarkdownSection }>

type ActionMarkdownOwner = EventTarget & Pick<ActionService, 'draftStore' | 'setActionEditorState'>

function actionTarget(target: MarkdownDocumentTarget): asserts target is ActionMarkdownTarget {
    if (target.document.kind !== 'action') throw new Error('Action Markdown source requires an action document')
}

function sectionMarkdown(
    definition: RawActionDefinition,
    section: ActionMarkdownSection,
    document: import('../../services/open_files_service').ActionOpenDocument,
) {
    if (section.kind === 'prompt') return definition.prompt ?? ''
    const phrase = requirePhrase(definition, section, document)
    return phrase.phrase.text
}

function requirePhrase(
    definition: RawActionDefinition,
    section: ActionMarkdownSection,
    document: import('../../services/open_files_service').ActionOpenDocument,
) {
    if (section.kind !== 'phrase') throw new Error(`Expected action phrase section: ${document.path}`)
    const phraseIndex = document.getObject().editorState?.phrases
        .findIndex(({ identity }) => identity === section.identity) ?? -1
    const phrase = definition.phrases?.[phraseIndex]
    if (phraseIndex < 0 || !phrase) throw new Error(`Unknown action phrase section: ${section.identity}`)

    return { phrase, phraseIndex }
}

function updatedDefinition(target: ActionMarkdownTarget, markdown: string) {
    const definition = target.document.getDraft()
    if (target.section.kind === 'prompt') return { ...definition, prompt: markdown }
    const { phraseIndex } = requirePhrase(definition, target.section, target.document)
    const phrases = definition.phrases ?? []
    return {
        ...definition,
        phrases: phrases.map((phrase, index) => index === phraseIndex ? { ...phrase, text: markdown } : phrase),
    }
}

function readActionMarkdown(target: MarkdownDocumentTarget) {
    actionTarget(target)
    return sectionMarkdown(target.document.getDraft(), target.section, target.document)
}

/** Reads and writes prompt/phrase sections through one canonical action document. */
export class ActionMarkdownDataSource extends MarkdownDataSourceBase {
    private service: ActionMarkdownOwner | null = null

    init(service: ActionMarkdownOwner) {
        if (this.service) return
        this.service = service
        openFilesService.addEventListener('documentChanged', this.handleDocumentChanged)
    }

    readonly getMarkdown = readActionMarkdown

    setActiveActionTarget(target: MarkdownDocumentTarget | null, discard = false) {
        if (target) actionTarget(target)
        this.setActiveTarget('list-action', target, discard)
    }

    edit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        ActionMarkdownDataSource.requireActionBinding(binding)
        actionTarget(target)
        try {
            const definition = updatedDefinition(target, markdown)
            target.document.updateDraft(definition, binding)
            this.requireService().draftStore.stageDraft(target.document.getObject().id, definition)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Action update failed: ${target.document.path}` })
        }
    }

    commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        ActionMarkdownDataSource.requireActionBinding(binding)
        actionTarget(target)
        try {
            const definition = updatedDefinition(target, markdown)
            target.document.updateDraft(definition, binding)
            this.requireService().draftStore.stageDraft(target.document.getObject().id, definition)
            if (target.section.kind === 'phrase') this.updatePhraseEditorState(target, definition)
            this.requireService().draftStore.commitDraft(target.document.getObject().id)
            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Action update failed: ${target.document.path}` })
            return false
        }
    }

    private updatePhraseEditorState(
        target: ActionMarkdownTarget,
        definition: RawActionDefinition,
    ) {
        if (target.section.kind !== 'phrase') return
        const action = target.document.getObject()
        const editorState = action.editorState
        if (!editorState) throw new Error(`Missing phrase editor state for action: ${action.id}`)
        const { phraseIndex } = requirePhrase(definition, target.section, target.document)
        const phrases = definition.phrases ?? []
        const nextEditorState: ActionEditorState = {
            ...editorState,
            phrases: editorState.phrases.map((entry, index) => (
                index === phraseIndex ? { ...entry, phrase: phrases[index] } : entry
            )),
        }
        this.requireService().setActionEditorState(action.id, nextEditorState)
    }

    private readonly handleDocumentChanged = (event: Event) => {
        const { document, origin, type } = (event as CustomEvent<OpenDocumentChangedDetail>).detail
        if (document.kind !== 'action' || type !== 'draft') return
        const target = this.getActiveTarget('list-action')
        if (!target || target.document !== document) return

        const originBinding = typeof origin === 'string' ? origin as MarkdownBindingKind : null
        this.dispatchMarkdownReplaced({ originBinding, target })
    }

    private static requireActionBinding(binding: MarkdownBindingKind) {
        if (binding !== 'list-action') throw new Error(`Action Markdown source cannot use ${binding} binding`)
    }

    private requireService() {
        if (!this.service) throw new Error('Action Markdown data source is not initialized')
        return this.service
    }
}

export const actionMarkdownDataSource = new ActionMarkdownDataSource()
