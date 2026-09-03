import { actionContextIdentity, type ActionContext } from '../../data/action_context'
import type { PreparedActionPrompt } from '../../data/action_run_types'
import { isRemoteControlConnectionError } from '../data/remote_control_storage_service'
import { register } from '../service_injector'
import { MarkdownDraft, type MarkdownDraftBinding } from '../markdown/markdown_draft'

const DRAFT_KEY_SEPARATOR = String.fromCharCode(0)

export type ActionPromptPreparationStatus = 'failed' | 'loading' | 'ready'

interface ActionPromptDraftEditorSnapshot {
    preparationStatus: ActionPromptPreparationStatus
    replacementRevision: number
}

interface ActionPromptDraftOptions {
    initialValue?: string
    prepare: boolean
}

function promptDraftKey(actionId: string, context: ActionContext, runId: string | null) {
    return `${actionId}${DRAFT_KEY_SEPARATOR}${actionContextIdentity(context)}${DRAFT_KEY_SEPARATOR}${runId ?? 'new'}`
}

/** Stable prompt state shared by editor and prompt-dependent leaf controls. */
export class ActionPromptDraft {
    private applyingExternalValue = false
    private diagramPath: string | null = null
    readonly editorDraft: MarkdownDraftBinding
    private editorSnapshot: ActionPromptDraftEditorSnapshot
    private locallyEdited = false
    readonly markdownDraft: MarkdownDraft
    private preparationRequired: boolean
    private preparationStarted = false
    private revision = 0

    constructor(initialValue: string, preparationRequired: boolean) {
        this.editorSnapshot = {
            preparationStatus: preparationRequired ? 'loading' : 'ready',
            replacementRevision: 0,
        }
        this.markdownDraft = new MarkdownDraft(initialValue)
        this.editorDraft = {
            addEventListener: (type, listener) => this.markdownDraft.addEventListener(type, listener),
            edit: this.handleEditorDraftEdit,
            getSnapshot: this.markdownDraft.getSnapshot,
            removeEventListener: (type, listener) => this.markdownDraft.removeEventListener(type, listener),
            subscribeEditor: this.markdownDraft.subscribeEditor,
        }
        this.markdownDraft.subscribe(this.handleMarkdownEdit)
        this.preparationRequired = preparationRequired
    }

    readonly getSnapshot = () => this.markdownDraft.getSnapshot()

    readonly getEditorSnapshot = () => this.editorSnapshot

    readonly requestInsertion = (markdown: string) => this.markdownDraft.requestInsertion(markdown)

    readonly subscribe = (listener: () => void) => this.markdownDraft.subscribe(listener)

    readonly subscribeEditor = (listener: () => void) => {
        this.markdownDraft.addEventListener('actionEditorChanged', listener)

        return () => this.markdownDraft.removeEventListener('actionEditorChanged', listener)
    }

    /** Record an intentional local value without starting asynchronous synchronization. */
    readonly edit = (value: string) => {
        this.markdownDraft.edit(value)
    }

    /** Replace editor content from an external source and notify editor exactly once. */
    replace(value: string) {
        this.revision += 1
        this.locallyEdited = false
        this.preparationRequired = false
        this.applyingExternalValue = true
        try {
            this.markdownDraft.replace(value)
        } finally {
            this.applyingExternalValue = false
        }
        this.editorSnapshot = {
            preparationStatus: 'ready',
            replacementRevision: this.editorSnapshot.replacementRevision + 1,
        }
        this.publishEditor()
    }

    clear() {
        this.diagramPath = null
        if (this.getSnapshot().length === 0 && this.editorSnapshot.preparationStatus === 'ready') {
            this.locallyEdited = false
            this.preparationRequired = true
            this.preparationStarted = false

            return
        }

        this.replace('')
        this.preparationRequired = true
        this.preparationStarted = false
    }

    async prepare(load: () => Promise<PreparedActionPrompt>) {
        if (!this.preparationRequired || this.preparationStarted) return

        this.preparationStarted = true
        this.setPreparationStatus('loading')
        const preparationRevision = this.revision
        try {
            const preparedPrompt = await load()
            if (this.revision !== preparationRevision) return

            this.diagramPath = preparedPrompt.diagramPath ?? null
            this.replace(preparedPrompt.prompt)
        } catch (error) {
            if (this.revision !== preparationRevision) return

            if (isRemoteControlConnectionError(error)) {
                this.preparationStarted = false
                this.setPreparationStatus('loading')

                return
            }

            this.preparationRequired = false
            this.setPreparationStatus('failed')
            throw error
        }
    }

    getRevision() {
        return this.revision
    }

    getDiagramPath() {
        return this.diagramPath
    }

    hasLocalEdits() {
        return this.locallyEdited && this.getSnapshot().length > 0
    }

    /** Asks a mounted editor to commit its debounced buffer before this value is inspected. */
    requestFlush() {
        this.markdownDraft.requestFlush()
    }

    private readonly handleEditorDraftEdit = (value: string) => {
        if (this.editorSnapshot.preparationStatus !== 'ready') return

        this.edit(value)
    }

    private readonly handleMarkdownEdit = () => {
        if (this.applyingExternalValue) return

        const empty = this.getSnapshot().length === 0
        this.revision += 1
        this.locallyEdited = !empty
        this.preparationRequired = empty
        if (empty) this.preparationStarted = false
        this.setPreparationStatus('ready')
    }

    private setPreparationStatus(preparationStatus: ActionPromptPreparationStatus) {
        if (this.editorSnapshot.preparationStatus === preparationStatus) return

        this.editorSnapshot = { ...this.editorSnapshot, preparationStatus }
        this.publishEditor()
    }

    private publishEditor() {
        this.markdownDraft.dispatchEvent(new Event('actionEditorChanged'))
    }
}

/** Owns lifetime-stable prompt drafts, revisions, and explicit cleanup. */
export class ActionPromptDraftService {
    private readonly drafts = new Map<string, ActionPromptDraft>()

    constructor() {
        register('actionPromptDraftService', this)
    }

    getDraft(actionId: string, context: ActionContext, runId: string | null, options: ActionPromptDraftOptions) {
        const key = promptDraftKey(actionId, context, runId)
        const current = this.drafts.get(key)
        if (current) return current

        const draft = new ActionPromptDraft(options.initialValue ?? '', options.prepare)
        this.drafts.set(key, draft)

        return draft
    }

    /** Empties the editor while keeping the draft object the editor is bound to. */
    clearDraft(actionId: string, context: ActionContext, runId: string | null) {
        this.drafts.get(promptDraftKey(actionId, context, runId))?.clear()
    }

    /** Drops a prepared default the user never touched and keeps every typed character. */
    discardUneditedDraft(actionId: string, context: ActionContext, runId: string | null) {
        const draft = this.drafts.get(promptDraftKey(actionId, context, runId))
        if (!draft) return

        draft.requestFlush()
        if (draft.hasLocalEdits()) return

        draft.clear()
    }

    /** Removes released run state unless it contains text the user edited. */
    deleteUneditedDraft(actionId: string, context: ActionContext, runId: string | null) {
        const key = promptDraftKey(actionId, context, runId)
        const draft = this.drafts.get(key)
        if (!draft) return

        draft.requestFlush()
        if (!draft.hasLocalEdits()) this.drafts.delete(key)
    }

    /** Flushes editor buffers, then removes every exact-empty prompt draft. */
    deleteEmptyDrafts() {
        for (const [key, draft] of this.drafts) {
            draft.requestFlush()
            if (draft.getSnapshot().length === 0) this.drafts.delete(key)
        }
    }

    clearAction(actionId: string) {
        const prefix = `${actionId}${DRAFT_KEY_SEPARATOR}`
        for (const key of this.drafts.keys()) {
            if (key.startsWith(prefix)) this.clearByKey(key)
        }
    }

    /** Drop cached prepared defaults while preserving user edits. */
    invalidateIdlePreparedDrafts(actionId: string) {
        const prefix = `${actionId}${DRAFT_KEY_SEPARATOR}`
        for (const [key, draft] of this.drafts) {
            if (key.startsWith(prefix) && !draft.hasLocalEdits()) this.drafts.delete(key)
        }
    }

    clearAll() {
        for (const draft of this.drafts.values()) draft.clear()
        this.drafts.clear()
    }

    private clearByKey(key: string) {
        const draft = this.drafts.get(key)
        if (!draft) return

        draft.clear()
        this.drafts.delete(key)
    }
}

export const actionPromptDraftService = new ActionPromptDraftService()
