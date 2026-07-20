import type { ActionDefinition, ActionEditorState, RawActionDefinition } from '../../data/action_types'
import type { ActionService } from '../../services/actions/action_service'
import { dialogService } from '../../services/dialog_service'
import { ACTION_PROMPT_TAB } from '../actions/action_phrase_editor_state'
import { MarkdownDataSourceBase, type MarkdownBindingKind } from './markdown_data_source'

interface ActionMarkdownDocumentIdentity {
    actionId: string
    editorDocumentId: string
    namespace: string
}

type ActionMarkdownOwner = EventTarget & Pick<ActionService,
    'commitDraft' | 'getActions' | 'getDeletedDraftActions' | 'getDraft' | 'setActionEditorState' | 'stageDraft'
>

function reportActionWriteError(documentId: string, error: unknown) {
    let context = documentId
    try {
        context = parseActionMarkdownDocumentId(documentId).actionId
    } catch {
        // Keep malformed ID itself as error context.
    }
    dialogService.error(error, { fallbackMessage: `Action update failed: ${context}` })
}

/** Namespace one prompt or phrase history document to its stable owning action. */
export function actionMarkdownDocumentId(namespace: string, actionId: string, editorDocumentId: string) {
    return JSON.stringify([namespace, actionId, editorDocumentId])
}

export function parseActionMarkdownDocumentId(documentId: string): ActionMarkdownDocumentIdentity {
    const value: unknown = JSON.parse(documentId)
    if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== 'string')) {
        throw new Error(`Invalid action Markdown document ID: ${documentId}`)
    }
    const [namespace, actionId, editorDocumentId] = value

    return { actionId, editorDocumentId, namespace }
}

/** Resolves and writes action prompt/phrase Markdown by full stable document ID. */
export class ActionMarkdownDataSource extends MarkdownDataSourceBase {
    private readonly markdownByDocumentId = new Map<string, string>()
    private documentNamespace: string | null = null
    private service: ActionMarkdownOwner | null = null

    init(service: ActionMarkdownOwner) {
        if (this.service) return

        this.service = service
        service.addEventListener('changed', this.handleChanged)
    }

    getMarkdown(documentId: string) {
        const { definition, editorDocumentId } = this.resolveDocument(documentId)
        const markdown = editorDocumentId === ACTION_PROMPT_TAB
            ? definition.prompt ?? ''
            : this.requirePhrase(documentId).phrase.text
        this.markdownByDocumentId.set(documentId, markdown)

        return markdown
    }

    setActiveActionDocument(namespace: string, documentId: string | null) {
        if (this.documentNamespace !== namespace) {
            this.clearBindings(true)
            this.clearWrittenMarkdown()
            this.markdownByDocumentId.clear()
            this.documentNamespace = namespace
        }
        if (documentId && parseActionMarkdownDocumentId(documentId).namespace !== namespace) {
            throw new Error(`Action Markdown document namespace does not match active project: ${documentId}`)
        }
        this.setActiveDocument('list-action', documentId)
    }

    edit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        ActionMarkdownDataSource.requireActionBinding(binding)
        const previousWrittenMarkdown = this.recordWrittenMarkdown(binding, documentId, markdown)
        try {
            this.stageDocument(documentId, markdown)
        } catch (error) {
            this.restoreWrittenMarkdown(documentId, previousWrittenMarkdown)
            reportActionWriteError(documentId, error)
        }
    }

    commit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        ActionMarkdownDataSource.requireActionBinding(binding)
        const previousWrittenMarkdown = this.recordWrittenMarkdown(binding, documentId, markdown)
        try {
            const { action, editorDocumentId, sourcePath } = this.stageDocument(documentId, markdown)
            if (editorDocumentId !== ACTION_PROMPT_TAB) this.updatePhraseEditorState(action, editorDocumentId, sourcePath)
            this.requireService().commitDraft(sourcePath)
            return true
        } catch (error) {
            this.restoreWrittenMarkdown(documentId, previousWrittenMarkdown)
            reportActionWriteError(documentId, error)
            return false
        }
    }

    forgetDocument(documentId: string) {
        this.markdownByDocumentId.delete(documentId)
        this.forgetWrittenMarkdown(documentId)
    }

    private readonly handleChanged = () => {
        for (const [documentId, previousMarkdown] of this.markdownByDocumentId) {
            let markdown: string
            try {
                markdown = this.getMarkdown(documentId)
            } catch {
                this.forgetDocument(documentId)
                continue
            }
            if (markdown === previousMarkdown) continue

            this.markdownByDocumentId.set(documentId, markdown)
            const originBinding = this.takeEchoOriginBinding(documentId, markdown)
            this.dispatchMarkdownReplaced({ documentId, originBinding })
        }
    }

    private stageDocument(documentId: string, markdown: string) {
        const resolved = this.resolveDocument(documentId)
        const { definition, editorDocumentId, sourcePath } = resolved
        let nextDefinition: RawActionDefinition
        if (editorDocumentId === ACTION_PROMPT_TAB) {
            nextDefinition = { ...definition, prompt: markdown }
        } else {
            const { phraseIndex } = this.requirePhrase(documentId)
            const phrases = definition.phrases ?? []
            nextDefinition = {
                ...definition,
                phrases: phrases.map((phrase, index) => index === phraseIndex ? { ...phrase, text: markdown } : phrase),
            }
        }
        this.requireService().stageDraft(sourcePath, nextDefinition)

        return resolved
    }

    private updatePhraseEditorState(action: ActionDefinition, editorDocumentId: string, sourcePath: string) {
        const editorState = action.editorState
        if (!editorState) throw new Error(`Missing phrase editor state for action: ${action.id}`)
        const definition = this.requireService().getDraft(sourcePath).definition
        const phrases = definition.phrases ?? []
        const phraseIndex = editorState.phrases.findIndex(({ identity }) => identity === editorDocumentId)
        if (phraseIndex < 0 || !phrases[phraseIndex]) throw new Error(`Unknown action phrase document: ${editorDocumentId}`)
        const nextEditorState: ActionEditorState = {
            ...editorState,
            phrases: editorState.phrases.map((entry, index) => (
                index === phraseIndex ? { ...entry, phrase: phrases[index] } : entry
            )),
        }
        this.requireService().setActionEditorState(sourcePath, nextEditorState)
    }

    private requirePhrase(documentId: string) {
        const { action, definition, editorDocumentId } = this.resolveDocument(documentId)
        const phraseIndex = action.editorState?.phrases.findIndex(({ identity }) => identity === editorDocumentId) ?? -1
        const phrase = definition.phrases?.[phraseIndex]
        if (phraseIndex < 0 || !phrase) throw new Error(`Unknown action phrase document: ${editorDocumentId}`)

        return { phrase, phraseIndex }
    }

    private resolveDocument(documentId: string) {
        const { actionId, editorDocumentId, namespace } = parseActionMarkdownDocumentId(documentId)
        if (namespace !== this.documentNamespace) {
            throw new Error(`Action Markdown document belongs to inactive project: ${documentId}`)
        }
        const service = this.requireService()
        const action = [...service.getActions(), ...service.getDeletedDraftActions()].find(({ id }) => id === actionId)
        if (!action?.sourcePath) throw new Error(`Unknown action Markdown document: ${documentId}`)
        const definition = service.getDraft(action.sourcePath).definition

        return { action, definition, editorDocumentId, sourcePath: action.sourcePath }
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
