import { register } from '../service_injector'

export interface WorkspaceOpenRequest {
    path: string
}

export interface WorkspaceRevealCardRequest {
    path: string
}

/**
 * Decouples the shell (search, and future callers) from the workspace view. Callers ask to open a
 * card/file by path; `ProjectWorkspace` subscribes and reveals it without changing the current view mode.
 */
export class WorkspaceNavigationService extends EventTarget {
    constructor() {
        super()
        register('workspaceNavigationService', this)
    }

    /** Requests that the workspace reveal the card or file at `path`. */
    open(path: string) {
        if (!path) throw new Error('Cannot open a workspace path without a path')

        this.dispatchEvent(new CustomEvent<WorkspaceOpenRequest>('open', { detail: { path } }))
    }

    /** Requests that the cards view select and scroll an active card into view. */
    revealCard(path: string) {
        if (!path) throw new Error('Cannot reveal a card without a path')

        this.dispatchEvent(new CustomEvent<WorkspaceRevealCardRequest>('revealCard', { detail: { path } }))
    }
}

export const workspaceNavigationService = new WorkspaceNavigationService()
