import { register } from './service_injector'

export type WorkspaceViewMode = 'cards' | 'text'

export interface WorkspaceViewSnapshot {
    selectedPath: string | null
    viewMode: WorkspaceViewMode
}

const INITIAL_SNAPSHOT: WorkspaceViewSnapshot = { selectedPath: null, viewMode: 'cards' }

/** Shared UI state for the project workspace view mode and selected card/file path. */
export class WorkspaceViewService extends EventTarget {
    private projectKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT

    constructor() {
        super()
        register('workspaceViewService', this)
    }

    getSnapshot(): WorkspaceViewSnapshot {
        return this.snapshot
    }

    selectPath(path: string) {
        if (!path) throw new Error('Cannot select a workspace path without a path')

        this.update({ ...this.snapshot, selectedPath: path })
    }

    clearSelectedPath(path: string) {
        if (this.snapshot.selectedPath !== path) return

        this.update({ ...this.snapshot, selectedPath: null })
    }

    syncProject(projectKey: string | null) {
        if (this.projectKey === projectKey) return

        this.projectKey = projectKey
        this.update(INITIAL_SNAPSHOT)
    }

    setViewMode(viewMode: WorkspaceViewMode) {
        this.update({ ...this.snapshot, viewMode })
    }

    private update(snapshot: WorkspaceViewSnapshot) {
        if (snapshot.selectedPath === this.snapshot.selectedPath && snapshot.viewMode === this.snapshot.viewMode) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<WorkspaceViewSnapshot>('changed', { detail: snapshot }))
    }
}

export const workspaceViewService = new WorkspaceViewService()
