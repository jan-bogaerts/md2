import { CARD_PATH_CHANGED_EVENT, dataService, type CardPathChangedEventDetail, type DataService } from '../data/data_service'
import { register } from '../service_injector'

export type WorkspaceViewMode = 'cards' | 'diagrams' | 'stats' | 'text'

export interface WorkspaceViewSnapshot {
    selectedPath: string | null
    viewMode: WorkspaceViewMode
}

const INITIAL_SNAPSHOT: WorkspaceViewSnapshot = { selectedPath: null, viewMode: 'cards' }

/** Shared UI state for the project workspace view mode and selected card/file path. */
export class WorkspaceViewService extends EventTarget {
    private projectKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT
    private readonly dataService: DataService

    constructor(dataServiceInstance: DataService) {
        super()
        this.dataService = dataServiceInstance
        this.projectKey = this.currentProjectKey()
        this.dataService.addEventListener('changed', this.handleDataServiceChanged)
        this.dataService.addEventListener(CARD_PATH_CHANGED_EVENT, this.handleCardPathChanged)
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

    private readonly handleCardPathChanged = (event: Event) => {
        const { fromPath, toPath } = (event as CustomEvent<CardPathChangedEventDetail>).detail
        if (this.snapshot.selectedPath !== fromPath) return

        this.update({ ...this.snapshot, selectedPath: toPath })
    }

    private readonly handleDataServiceChanged = () => {
        this.syncProject(this.currentProjectKey())
    }

    private syncProject(projectKey: string | null) {
        if (this.projectKey === projectKey) return

        this.projectKey = projectKey
        this.update(INITIAL_SNAPSHOT)
    }

    private currentProjectKey(): string | null {
        const { project } = this.dataService.getState()
        if (!project) return null

        return `${project.id}:${project.branch}`
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

export const workspaceViewService = register('workspaceViewService', new WorkspaceViewService(dataService))
