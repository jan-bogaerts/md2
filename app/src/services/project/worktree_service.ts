import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { register } from '.././service_injector'

export class WorktreeService extends EventTarget {
    private draftRecords: WorktreeRecord[] | null = null
    private projectProvider: (() => ProjectReference | null) | null = null
    private records: WorktreeRecord[] = []
    private storageProvider: (() => StorageService | null) | null = null

    constructor() {
        super()
        register('worktreeService', this)
    }

    getRecords() {
        return this.records
    }

    /** Whether the active storage backend can list worktrees (local desktop or a remote-controlled desktop). */
    isSupported() {
        return !!this.storageProvider?.()?.loadWorktrees
    }

    getDraft() {
        return this.draftRecords
    }

    init(dependencies: { projectProvider: () => ProjectReference | null; storageProvider: () => StorageService | null }) {
        this.projectProvider = dependencies.projectProvider
        this.storageProvider = dependencies.storageProvider
        this.clear()
    }

    async load(project: ProjectReference) {
        const storage = this.requireStorage()
        this.draftRecords = null
        this.records = storage.loadWorktrees ? await storage.loadWorktrees(project) : []
        this.dispatchChanged()

        return this.records
    }

    clear() {
        this.draftRecords = null
        this.records = []
        this.dispatchChanged()
    }

    loadDraft() {
        this.draftRecords = [...this.records]
        this.dispatchChanged()

        return this.draftRecords
    }

    discardDraft() {
        this.draftRecords = null
        this.dispatchChanged()
    }

    async addDraft() {
        const storage = this.requireStorage()
        if (!storage.selectWorktreeFolder) throw new Error('Worktree selection requires Electron local mode')

        const draft = this.requireDraft()
        const record = await storage.selectWorktreeFolder(draft.map(({ path }) => path))
        if (!record) return null

        this.draftRecords = [...draft, record]
        this.dispatchChanged()

        return record
    }

    removeDraft(index: number) {
        const draft = this.requireDraft()
        if (!Number.isInteger(index) || index < 0 || index >= draft.length) throw new Error(`Invalid worktree list index: ${index}`)

        this.draftRecords = draft.filter((_record, recordIndex) => recordIndex !== index)
        this.dispatchChanged()
    }

    async saveDraft() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        if (!storage.saveWorktrees) throw new Error('Worktree saving requires Electron local mode')

        const draft = this.requireDraft()
        this.records = await storage.saveWorktrees(project, draft.map(({ path }) => path))
        this.draftRecords = [...this.records]
        this.dispatchChanged()

        return this.records
    }

    private requireDraft() {
        if (!this.draftRecords) throw new Error('Worktree draft is not loaded')

        return this.draftRecords
    }

    private requireProject() {
        const project = this.projectProvider?.()
        if (!project) throw new Error('Cannot save worktrees before a project is open')

        return project
    }

    private requireStorage() {
        const storage = this.storageProvider?.()
        if (!storage) throw new Error('Worktree service storage is not initialized')

        return storage
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const worktreeService = new WorktreeService()
