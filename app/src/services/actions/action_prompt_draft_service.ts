import { actionContextIdentity, type ActionContext } from '../../data/action_context'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { ActionDefinition } from '../../data/action_types'
import { isRemoteControlConnectionError } from '../data/remote_control_storage_service'
import { register } from '../service_injector'
import { MarkdownDraft } from '../markdown/markdown_draft'

export type ActionPromptPreparationStatus = 'failed' | 'loading' | 'ready'

export interface ActionPromptRunBinding {
    activeActionId: string | null
    activeActionType: ActionDefinition['type'] | null
    runId: string
    interactionReady: boolean
    rootActionId: string
}

interface ActionPromptDraftEditorSnapshot {
    preparationStatus: ActionPromptPreparationStatus
    replacementRevision: number
}

interface ActionPromptDraftOptions {
    initialValue?: string
    prepare: boolean
}

function idlePromptDraftKey(actionId: string, context: ActionContext) {
    return `idle\u0000${actionId}\u0000${actionContextIdentity(context)}`
}

function runPromptDraftKey(runId: string, actionId: string) {
    return `run\u0000${runId}\u0000${actionId}`
}

async function enqueueActionPrompt(runId: string, content: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.enqueueActionPrompt) throw new Error('Agent prompt queue requires Electron')

    return bridge.enqueueActionPrompt(runId, content)
}

/** Stable prompt state shared by editor and prompt-dependent leaf controls. */
export class ActionPromptDraft {
    private editorSnapshot: ActionPromptDraftEditorSnapshot
    private locallyEdited = false
    readonly markdownDraft: MarkdownDraft
    private run: ActionPromptRunBinding | null
    private preparationRequired: boolean
    private preparationStarted = false
    private revision = 0

    constructor(
        initialValue: string,
        preparationRequired: boolean,
        run: ActionPromptRunBinding | null,
    ) {
        this.editorSnapshot = {
            preparationStatus: preparationRequired ? 'loading' : 'ready',
            replacementRevision: 0,
        }
        this.markdownDraft = new MarkdownDraft(initialValue)
        this.run = run
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

    bindRun(run: ActionPromptRunBinding | null) {
        this.run = run
    }

    /** Record an editor-local value without starting asynchronous synchronization. */
    readonly edit = (value: string) => {
        this.revision += 1
        this.locallyEdited = true
        this.preparationRequired = false
        this.setPreparationStatus('ready')
        this.markdownDraft.edit(value)
    }

    /** Replace editor content from an external source and notify editor exactly once. */
    replace(value: string) {
        this.revision += 1
        this.locallyEdited = false
        this.preparationRequired = false
        this.markdownDraft.replace(value)
        this.editorSnapshot = {
            preparationStatus: 'ready',
            replacementRevision: this.editorSnapshot.replacementRevision + 1,
        }
        this.publishEditor()
    }

    clear() {
        if (this.getSnapshot().length === 0 && this.editorSnapshot.preparationStatus === 'ready') return

        this.replace('')
    }

    async prepare(load: () => Promise<string>) {
        if (!this.preparationRequired || this.preparationStarted) return

        this.preparationStarted = true
        const preparationRevision = this.revision
        try {
            const value = await load()
            if (this.revision !== preparationRevision) return

            this.replace(value)
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

    hasLocalEdits() {
        return this.locallyEdited
    }

    async send() {
        const run = this.run
        if (!run?.activeActionId) throw new Error('Action run has no active agent')
        if (this.getSnapshot().trim().length === 0) throw new Error('Queued agent prompt is empty')

        const value = this.getSnapshot()
        const revision = this.revision
        await enqueueActionPrompt(run.runId, value)
        if (this.revision === revision) this.clear()
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

/** Owns lifetime-stable prompt drafts, remote sessions, revisions, and explicit cleanup. */
export class ActionPromptDraftService {
    private readonly drafts = new Map<string, ActionPromptDraft>()

    constructor() {
        register('actionPromptDraftService', this)
    }

    getDraft(
        actionId: string,
        context: ActionContext,
        run: ActionPromptRunBinding | null,
        options: ActionPromptDraftOptions,
    ) {
        const activeRun = run?.rootActionId === actionId
            && run.activeActionType === 'agent'
            && run.activeActionId
            ? run
            : null
        const key = activeRun
            ? runPromptDraftKey(activeRun.runId, activeRun.activeActionId as string)
            : idlePromptDraftKey(actionId, context)
        const current = this.drafts.get(key)
        if (current) {
            current.bindRun(activeRun)

            return current
        }

        const draft = new ActionPromptDraft(options.initialValue ?? '', options.prepare, activeRun)
        this.drafts.set(key, draft)

        return draft
    }

    clearDraft(actionId: string, context: ActionContext, run: ActionPromptRunBinding | null) {
        const activeActionId = run?.rootActionId === actionId ? run.activeActionId : null
        if (activeActionId && run) this.clearByKey(runPromptDraftKey(run.runId, activeActionId))
        this.clearByKey(idlePromptDraftKey(actionId, context))
    }

    clearRunDraft(runId: string, actionId: string) {
        this.clearByKey(runPromptDraftKey(runId, actionId))
    }

    clearRunDrafts(runId: string) {
        const prefix = `run\u0000${runId}\u0000`
        for (const key of this.drafts.keys()) {
            if (key.startsWith(prefix)) this.clearByKey(key)
        }
    }

    clearAction(actionId: string) {
        const idlePrefix = `idle\u0000${actionId}\u0000`
        const runSuffix = `\u0000${actionId}`
        for (const key of this.drafts.keys()) {
            if (key.startsWith(idlePrefix) || (key.startsWith('run\u0000') && key.endsWith(runSuffix))) {
                this.clearByKey(key)
            }
        }
    }

    /** Drop cached prepared defaults while preserving user edits and active-run drafts. */
    invalidateIdlePreparedDrafts(actionId: string) {
        const idlePrefix = `idle\u0000${actionId}\u0000`
        for (const [key, draft] of this.drafts) {
            if (key.startsWith(idlePrefix) && !draft.hasLocalEdits()) this.drafts.delete(key)
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
