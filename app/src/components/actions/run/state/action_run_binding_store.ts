import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import type { ActionContext } from '../../../../data/action_context'

const BINDING_CHANGED_EVENT = 'bindingChanged'

/** Owns run selected by one popup action/context runtime. Null selects New conversation. */
export class ActionRunBindingStore extends EventTarget {
    private boundRunId: string | null
    private selectionConfigured: boolean
    private unsubscribeInitialRun: (() => void) | null = null
    private unsubscribeRun: (() => void) | null

    constructor(initialRunId: string | null) {
        super()
        this.boundRunId = initialRunId
        this.selectionConfigured = initialRunId !== null
        this.unsubscribeRun = initialRunId ? actionRunRegistry.subscribeRun(initialRunId, () => undefined) : null
    }

    readonly getSnapshot = () => this.boundRunId

    readonly subscribe = (listener: () => void) => {
        this.addEventListener(BINDING_CHANGED_EVENT, listener)

        return () => this.removeEventListener(BINDING_CHANGED_EVENT, listener)
    }

    setRunId(runId: string | null) {
        this.selectionConfigured = true
        this.unsubscribeInitialRun?.()
        this.unsubscribeInitialRun = null
        if (this.boundRunId === runId) return

        this.unsubscribeRun?.()
        this.boundRunId = runId
        this.unsubscribeRun = runId ? actionRunRegistry.subscribeRun(runId, () => undefined) : null
        this.dispatchEvent(new Event(BINDING_CHANGED_EVENT))
    }

    adoptInitialRun(runId: string | null) {
        if (this.selectionConfigured || runId === null) return

        this.selectionConfigured = true
        this.unsubscribeInitialRun?.()
        this.unsubscribeInitialRun = null
        this.boundRunId = runId
        this.unsubscribeRun = actionRunRegistry.subscribeRun(runId, () => undefined)
        this.dispatchEvent(new Event(BINDING_CHANGED_EVENT))
    }

    trackInitialRun(actionId: string, context: ActionContext) {
        if (this.selectionConfigured || this.unsubscribeInitialRun) return

        this.unsubscribeInitialRun = actionRunRegistry.subscribeActionRun(actionId, context, () => {
            const runId = actionRunRegistry.getActionRunStore(actionId, context)?.getSnapshot().runId ?? null
            this.adoptInitialRun(runId)
        })
    }

    dispose() {
        this.unsubscribeInitialRun?.()
        this.unsubscribeInitialRun = null
        this.unsubscribeRun?.()
        this.unsubscribeRun = null
    }
}
