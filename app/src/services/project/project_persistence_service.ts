import type { ActionService } from '../actions/action_service'
import type { DataService } from '../data/data_service'
import { register } from '../service_injector'

export type LocalSaveState = 'dirty' | 'saved' | 'saving'

export interface ProjectPersistenceSnapshot {
    hasPendingPush: boolean
    hasPendingSave: boolean
    localSaveState: LocalSaveState
}

export interface ProjectPersistenceServiceDependencies {
    actionService: ActionService
    dataService: DataService
}

const INITIAL_SNAPSHOT: ProjectPersistenceSnapshot = {
    hasPendingPush: false,
    hasPendingSave: false,
    localSaveState: 'saved',
}

export class ProjectPersistenceService extends EventTarget {
    private dependencies: ProjectPersistenceServiceDependencies | null = null
    private snapshot = INITIAL_SNAPSHOT

    constructor() {
        super()
        register('projectPersistenceService', this)
    }

    init(dependencies: ProjectPersistenceServiceDependencies) {
        if (
            this.dependencies?.actionService === dependencies.actionService
            && this.dependencies.dataService === dependencies.dataService
        ) return

        this.removeDependencyListeners()
        this.dependencies = dependencies
        dependencies.actionService.addEventListener('changed', this.handleDependencyChanged)
        dependencies.dataService.addEventListener('persistenceChanged', this.handleDependencyChanged)
        this.reconcileSnapshot()
    }

    getSnapshot(): ProjectPersistenceSnapshot {
        return this.snapshot
    }

    async flushPendingChanges() {
        const { actionService, dataService } = this.requireDependencies()
        if (actionService.hasPendingDrafts()) await actionService.flushDrafts()
        if (dataService.getPersistenceSnapshot().hasPendingCardCommit) await dataService.cards.flushPendingCommits()
    }

    private readonly handleDependencyChanged = () => {
        this.reconcileSnapshot()
    }

    private reconcileSnapshot() {
        const { actionService, dataService } = this.requireDependencies()
        const { hasPendingCardCommit, hasPendingPush, isSaving } = dataService.getPersistenceSnapshot()
        const hasPendingSave = isSaving || hasPendingCardCommit || actionService.hasPendingDrafts()
        const nextSnapshot: ProjectPersistenceSnapshot = {
            hasPendingPush,
            hasPendingSave,
            localSaveState: isSaving ? 'saving' : hasPendingSave ? 'dirty' : 'saved',
        }
        if (ProjectPersistenceService.isSameSnapshot(this.snapshot, nextSnapshot)) return

        this.snapshot = nextSnapshot
        this.dispatchEvent(new CustomEvent<ProjectPersistenceSnapshot>('changed', { detail: nextSnapshot }))
    }

    private removeDependencyListeners() {
        if (!this.dependencies) return

        this.dependencies.actionService.removeEventListener('changed', this.handleDependencyChanged)
        this.dependencies.dataService.removeEventListener('persistenceChanged', this.handleDependencyChanged)
    }

    private requireDependencies() {
        if (!this.dependencies) throw new Error('Project persistence service is not initialized')

        return this.dependencies
    }

    private static isSameSnapshot(first: ProjectPersistenceSnapshot, second: ProjectPersistenceSnapshot) {
        return first.hasPendingPush === second.hasPendingPush
            && first.hasPendingSave === second.hasPendingSave
            && first.localSaveState === second.localSaveState
    }
}

export const projectPersistenceService = new ProjectPersistenceService()
