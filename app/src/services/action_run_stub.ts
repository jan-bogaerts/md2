import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'

/** Outcome of a (stubbed) action run, until the execution service from F-010c lands. */
export interface ActionRunResult {
    message: string
    status: 'not-runnable'
}

/**
 * Placeholder for the execution service delivered by F-010c. The popup's `Run`
 * command calls this so the UI is wired end to end; it only reports that the
 * action is not yet runnable.
 */
export function runActionStub(action: ActionDefinition, context: ActionContext): ActionRunResult {
    void action
    void context

    return { message: 'not yet runnable', status: 'not-runnable' }
}
