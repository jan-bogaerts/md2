import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition, type ActionFile } from '../data/action_types'
import { actionMatchesContext, type ActionContext } from '../data/action_context'
import { loadActionDefinitions } from './action_definition_loader'
import { register } from './service_injector'

export interface ActionServiceState {
    actions: ActionDefinition[]
    error: string | null
}

/**
 * Singleton app service that holds the loaded action definitions and exposes them to React.
 * This slice only reads/exposes definitions; running and displaying them come later.
 */
export class ActionService extends EventTarget {
    private actions: ActionDefinition[]
    private error: string | null

    constructor() {
        super()
        this.actions = [BUILTIN_CUSTOM_PROMPT]
        this.error = null
        register('actionService', this)
    }

    /** Reset to only the built-in action, before a project is loaded. */
    init() {
        this.actions = loadActionDefinitions([])
        this.error = null
        this.dispatchChanged()
    }

    /** Replace the action set from the project's action json files. Fails fast on invalid definitions. */
    loadFromFiles(files: ActionFile[]) {
        this.actions = loadActionDefinitions(files)
        this.error = null
        this.dispatchChanged()

        return this.actions
    }

    /** Reload action files after a watcher event, retaining the previous valid set on validation failure. */
    reloadFromFiles(files: ActionFile[], changedPath: string) {
        try {
            return this.loadFromFiles(files)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action reload failed'
            this.error = `Action reload failed for ${changedPath}: ${message}`
            this.dispatchChanged()

            return this.actions
        }
    }

    clear() {
        this.actions = [BUILTIN_CUSTOM_PROMPT]
        this.error = null
        this.dispatchChanged()
    }

    getState(): ActionServiceState {
        return { actions: this.actions, error: this.error }
    }

    getActions(): ActionDefinition[] {
        return this.actions
    }

    getActionsForStateTrigger(state: string, context: ActionContext): ActionDefinition[] {
        return this.actions.filter((action) => action.onState === state && actionMatchesContext(action, context))
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ActionServiceState>('changed', { detail: this.getState() }))
    }
}

export const actionService = new ActionService()
