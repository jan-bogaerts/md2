import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { register } from '.././service_injector'

export class WorktreeService extends EventTarget {
    private adding = false
    private projectActionWorktree: number | null = null
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

    getProjectActionWorktree() {
        return this.projectActionWorktree
    }

    isAdding() {
        return this.adding
    }

    /** Whether the active storage backend can list worktrees (local desktop or a remote-controlled desktop). */
    isSupported() {
        return !!this.storageProvider?.()?.loadWorktrees
    }

    init(dependencies: { projectProvider: () => ProjectReference | null; storageProvider: () => StorageService | null }) {
        this.projectProvider = dependencies.projectProvider
        this.storageProvider = dependencies.storageProvider
        this.clear()
    }

    async load(project: ProjectReference) {
        const storage = this.requireStorage()
        this.projectActionWorktree = null
        this.records = storage.loadWorktrees ? await storage.loadWorktrees(project) : []
        this.dispatchChanged()

        return this.records
    }

    clear() {
        this.projectActionWorktree = null
        this.records = []
        this.dispatchChanged()
    }

    setProjectActionWorktree(worktree: number | null) {
        if (worktree !== null) {
            if (!Number.isInteger(worktree) || worktree <= 0) throw new Error(`Invalid project worktree index: ${String(worktree)}`)
            const record = this.records[worktree - 1]
            if (!record) throw new Error(`Configured worktree ${worktree} does not exist`)
            if (!record.valid) throw new Error(`Configured worktree ${worktree} is invalid: ${record.error}`)
        }
        if (this.projectActionWorktree === worktree) return

        this.projectActionWorktree = worktree
        this.dispatchChanged()
    }

    async add() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        if (!storage.addWorktree) throw new Error('Worktree creation requires Electron local mode')
        if (this.adding) throw new Error('Worktree creation is already in progress')

        this.adding = true
        this.dispatchChanged()
        try {
            const records = await storage.addWorktree(project)
            if (!records) return null

            this.records = records

            return records
        } finally {
            this.adding = false
            this.dispatchChanged()
        }
    }

    async remove(index: number) {
        const storage = this.requireStorage()
        const project = this.requireProject()
        if (!storage.removeWorktree) throw new Error('Worktree removal requires Electron local mode')
        if (!Number.isInteger(index) || index < 0 || index >= this.records.length) throw new Error(`Invalid worktree list index: ${index}`)

        this.records = await storage.removeWorktree(project, this.records[index].path)
        this.dispatchChanged()

        return this.records
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
