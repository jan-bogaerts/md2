import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition, type ActionFile } from '../data/action_types'
import { loadActionDefinitions } from './action_definition_loader'
import { register } from './service_injector'

export interface ActionServiceState {
    actions: ActionDefinition[]
}

/**
 * Singleton app service that holds the loaded action definitions and exposes them to React.
 * This slice only reads/exposes definitions; running and displaying them come later.
 */
export class ActionService extends EventTarget {
    private actions: ActionDefinition[]

    constructor() {
        super()
        this.actions = [BUILTIN_CUSTOM_PROMPT]
        register('actionService', this)
    }

    /** Reset to only the built-in action, before a project is loaded. */
    init() {
        this.actions = loadActionDefinitions([])
        this.dispatchChanged()
    }

    /** Replace the action set from the project's action json files. Fails fast on invalid definitions. */
    loadFromFiles(files: ActionFile[]) {
        this.actions = loadActionDefinitions(files)
        this.dispatchChanged()

        return this.actions
    }

    clear() {
        this.actions = [BUILTIN_CUSTOM_PROMPT]
        this.dispatchChanged()
    }

    getState(): ActionServiceState {
        return { actions: this.actions }
    }

    getActions(): ActionDefinition[] {
        return this.actions
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ActionServiceState>('changed', { detail: this.getState() }))
    }
}

export const actionService = new ActionService()
