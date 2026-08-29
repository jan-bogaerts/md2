import type { ActionService } from '../actions/action_service'
import { ACTION_PERSISTENCE_CHANGED_EVENT } from '../actions/action_service_events'
import type { DataService } from '../data/data_service'
import { register } from '../service_injector'
import type { OpenFilesService } from '../open_files_service'
import { stageMarkdownEditors } from './markdown_editor_staging'

export type LocalSaveState = 'dirty' | 'saved' | 'saving'

export interface ProjectPersistenceSnapshot {
    hasPendingPush: boolean
    hasPendingSave: boolean
    localSaveState: LocalSaveState
}

export interface ProjectPersistenceServiceDependencies {
    actionService: ActionService
    dataService: DataService
    openFilesService: OpenFilesService
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
            && this.dependencies.openFilesService === dependencies.openFilesService
        ) return

        this.removeDependencyListeners()
        this.dependencies = dependencies
        dependencies.actionService.addEventListener(ACTION_PERSISTENCE_CHANGED_EVENT, this.handleDependencyChanged)
        dependencies.dataService.addEventListener('persistenceChanged', this.handleDependencyChanged)
        dependencies.openFilesService.addEventListener('documentChanged', this.handleDependencyChanged)
        dependencies.openFilesService.addEventListener('removed', this.handleDependencyChanged)
        this.reconcileSnapshot()
    }

    getSnapshot(): ProjectPersistenceSnapshot {
        return this.snapshot
    }

    async flushPendingChanges() {
        const { actionService, dataService, openFilesService } = this.requireDependencies()
        if (!stageMarkdownEditors()) throw new Error('A Markdown editor could not stage its pending changes')
        if (actionService.draftStore.hasPendingDrafts()) await actionService.draftStore.flushDrafts()
        for (const document of openFilesService.getRegisteredDocuments()) {
            if (document.kind === 'card' && document.dirty) {
                dataService.cards.updateCardBody(document.path, document.getDraft().content, document.createSaveReference())
            }
        }
        if (dataService.getPersistenceSnapshot().hasPendingFileCommit) await dataService.cards.flushPendingCommits()
        await dataService.drainPendingStorageWrites()
        this.reconcileSnapshot()

        const pendingSaveBlockers = this.getPendingSaveBlockers()
        if (pendingSaveBlockers.length > 0) {
            throw new Error(`Pending changes remain after flush: ${pendingSaveBlockers.join(', ')}`)
        }
    }

    private readonly handleDependencyChanged = () => {
        this.reconcileSnapshot()
    }

    private reconcileSnapshot() {
        const { actionService, dataService, openFilesService } = this.requireDependencies()
        const { hasPendingFileCommit, hasPendingPush, isSaving } = dataService.getPersistenceSnapshot()
        const hasDirtyDocument = openFilesService.getRegisteredDocuments().some(({ dirty }) => dirty)
        const hasPendingSave = isSaving || hasPendingFileCommit || hasDirtyDocument || actionService.draftStore.hasPendingDrafts()
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

        this.dependencies.actionService.removeEventListener(ACTION_PERSISTENCE_CHANGED_EVENT, this.handleDependencyChanged)
        this.dependencies.dataService.removeEventListener('persistenceChanged', this.handleDependencyChanged)
        this.dependencies.openFilesService.removeEventListener('documentChanged', this.handleDependencyChanged)
        this.dependencies.openFilesService.removeEventListener('removed', this.handleDependencyChanged)
    }

    private getPendingSaveBlockers() {
        const { actionService, dataService, openFilesService } = this.requireDependencies()
        const { hasPendingFileCommit, isSaving } = dataService.getPersistenceSnapshot()
        const dirtyDocuments = openFilesService.getRegisteredDocuments()
            .filter(({ dirty }) => dirty)
            .map(({ kind, path }) => `${kind} document ${path}`)
        const blockers = [...dirtyDocuments]
        if (actionService.draftStore.hasPendingDrafts()) blockers.push('action drafts')
        if (hasPendingFileCommit) blockers.push('file commit batch')
        if (isSaving) blockers.push('storage writes')

        return blockers
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
