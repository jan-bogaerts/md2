import { actionContextIdentity, type ActionContext } from '../../data/action_context'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { ActionDefinition } from '../../data/action_types'
import { register } from '../service_injector'

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

type ActionPromptDraftListener = () => void

function idlePromptDraftKey(actionId: string, context: ActionContext) {
    return `idle\u0000${actionId}\u0000${actionContextIdentity(context)}`
}

function runPromptDraftKey(runId: string, actionId: string) {
    return `run\u0000${runId}\u0000${actionId}`
}

async function beginActionPromptDraft(runId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.beginActionPromptDraft) throw new Error('Agent prompt queue requires Electron')

    return bridge.beginActionPromptDraft(runId)
}

async function setActionQueuedMessage(runId: string, sessionId: number, content: string, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.setActionQueuedMessage) throw new Error('Agent prompt queue requires Electron')

    const result = await bridge.setActionQueuedMessage(runId, sessionId, content, revision)
    if (!result.accepted) throw new Error('Queued agent prompt was superseded')
}

async function sendActionQueuedMessage(runId: string, sessionId: number, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.sendActionQueuedMessage) throw new Error('Sending queued agent prompt requires Electron')

    const result = await bridge.sendActionQueuedMessage(runId, sessionId, revision)
    if (!result.sent) throw new Error('Queued agent prompt was not sent')
}

/** Stable prompt state shared by editor and prompt-dependent leaf controls. */
export class ActionPromptDraft {
    private editorSnapshot: ActionPromptDraftEditorSnapshot
    private readonly editorListeners = new Set<ActionPromptDraftListener>()
    private locallyEdited = false
    private run: ActionPromptRunBinding | null
    private pendingWrite: Promise<void> = Promise.resolve()
    private preparationRequired: boolean
    private preparationStarted = false
    private promptSession: Promise<number> | null = null
    private revision = 0
    private readonly valueListeners = new Set<ActionPromptDraftListener>()
    private value: string

    constructor(
        initialValue: string,
        preparationRequired: boolean,
        run: ActionPromptRunBinding | null,
    ) {
        this.editorSnapshot = {
            preparationStatus: preparationRequired ? 'loading' : 'ready',
            replacementRevision: 0,
        }
        this.run = run
        this.preparationRequired = preparationRequired
        this.value = initialValue
    }

    readonly getSnapshot = () => this.value

    readonly getEditorSnapshot = () => this.editorSnapshot

    readonly subscribe = (listener: ActionPromptDraftListener) => {
        this.valueListeners.add(listener)

        return () => this.valueListeners.delete(listener)
    }

    readonly subscribeEditor = (listener: ActionPromptDraftListener) => {
        this.editorListeners.add(listener)

        return () => this.editorListeners.delete(listener)
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
        this.setValue(value)
    }

    /** Replace editor content from an external source and notify editor exactly once. */
    replace(value: string) {
        this.revision += 1
        this.locallyEdited = false
        this.preparationRequired = false
        this.setValue(value)
        this.editorSnapshot = {
            preparationStatus: 'ready',
            replacementRevision: this.editorSnapshot.replacementRevision + 1,
        }
        this.publishEditor()
    }

    clear() {
        if (this.value.length === 0 && this.editorSnapshot.preparationStatus === 'ready') return

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

            this.preparationRequired = false
            this.setPreparationStatus('failed')
            throw error
        }
    }

    hasLocalEdits() {
        return this.locallyEdited
    }

    async synchronize() {
        const run = this.run
        if (!run?.interactionReady || run.activeActionType !== 'agent' || !run.activeActionId) return

        const value = this.value
        const revision = this.revision
        const pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
            const sessionId = await this.getPromptSession(run.runId)
            await setActionQueuedMessage(run.runId, sessionId, value, revision)
        })
        this.pendingWrite = pendingWrite

        try {
            await pendingWrite
        } catch (error) {
            this.promptSession = null
            throw error
        }
    }

    async send() {
        const run = this.run
        if (!run?.activeActionId) throw new Error('Action run has no active agent')
        if (this.value.trim().length === 0) throw new Error('Queued agent prompt is empty')

        await this.pendingWrite
        const value = this.value
        const revision = this.revision
        const sessionId = await this.getPromptSession(run.runId)
        try {
            await setActionQueuedMessage(run.runId, sessionId, value, revision)
            await sendActionQueuedMessage(run.runId, sessionId, revision)
            this.clear()
        } catch (error) {
            this.promptSession = null
            throw error
        }
    }

    private getPromptSession(runId: string) {
        if (this.promptSession) return this.promptSession

        const promptSession = beginActionPromptDraft(runId).catch((error: unknown) => {
            this.promptSession = null
            throw error
        })
        this.promptSession = promptSession

        return promptSession
    }

    private setValue(value: string) {
        if (this.value === value) return

        this.value = value
        for (const listener of this.valueListeners) listener()
    }

    private setPreparationStatus(preparationStatus: ActionPromptPreparationStatus) {
        if (this.editorSnapshot.preparationStatus === preparationStatus) return

        this.editorSnapshot = { ...this.editorSnapshot, preparationStatus }
        this.publishEditor()
    }

    private publishEditor() {
        for (const listener of this.editorListeners) listener()
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
