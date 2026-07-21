import { slugifyTitle } from '../../data/card_naming'
import type { CardSeparator } from '../../data/card_identifiers'
import type { ProjectCard, ProjectReference, ProjectSnapshot, StorageService, WorktreeRecord } from '../../data/data_types'
import { register } from '.././service_injector'

interface WorktreeServiceDependencies {
    assignCardWorktree: (path: string, worktree: number | null) => void
    cardSeparatorProvider: () => CardSeparator
    projectProvider: () => ProjectReference | null
    snapshotProvider: () => ProjectSnapshot | null
    storageProvider: () => StorageService | null
}

export class WorktreeService extends EventTarget {
    private adding = false
    private assignCardWorktreeValue: ((path: string, worktree: number | null) => void) | null = null
    private cardSeparatorProvider: (() => CardSeparator) | null = null
    private loadedProjectKey: string | null = null
    private pendingAssignments = new Map<number, string>()
    private preparingCardPaths = new Set<string>()
    private projectActionWorktree: number | null = null
    private projectProvider: (() => ProjectReference | null) | null = null
    private records: WorktreeRecord[] = []
    private snapshotProvider: (() => ProjectSnapshot | null) | null = null
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

    isPreparingCard(path: string) {
        return this.preparingCardPaths.has(path)
    }

    isWorktreeAvailableForCard(worktree: number, cardPath: string) {
        const pendingOwner = this.pendingAssignments.get(worktree)
        if (pendingOwner && pendingOwner !== cardPath) return false

        return !this.activeCards().some((card) => card.path !== cardPath && card.header.worktree === worktree)
    }

    /** Whether the active storage backend can list worktrees (local desktop or a remote-controlled desktop). */
    isSupported() {
        return !!this.storageProvider?.()?.loadWorktrees
    }

    init(dependencies: WorktreeServiceDependencies) {
        this.assignCardWorktreeValue = dependencies.assignCardWorktree
        this.cardSeparatorProvider = dependencies.cardSeparatorProvider
        this.projectProvider = dependencies.projectProvider
        this.snapshotProvider = dependencies.snapshotProvider
        this.storageProvider = dependencies.storageProvider
        this.clear()
    }

    async load(project: ProjectReference) {
        const storage = this.requireStorage()
        const projectKey = `${project.id}\u0000${project.branch}`
        if (this.loadedProjectKey !== projectKey) this.projectActionWorktree = null
        this.loadedProjectKey = projectKey
        this.records = storage.loadWorktrees ? await storage.loadWorktrees(project) : []
        this.dispatchChanged()

        return this.records
    }

    clear() {
        this.loadedProjectKey = null
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

    async setCardWorktree(path: string, worktree: number | null) {
        const card = this.requireCard(path)
        if (card.header.worktree === worktree && !card.header.worktreeError) return
        if (this.preparingCardPaths.has(path)) throw new Error(`Worktree preparation is already in progress for ${path}`)

        if (worktree === null) {
            if (card.header.worktreeError || card.header.worktree === null || card.header.worktree === undefined) {
                this.requireAssignmentWriter()(path, null)
                return
            }

            const storage = this.requireStorage()
            if (!storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')
            const project = this.requireProject()
            this.startCardOperation(path)
            try {
                this.records = await storage.parkWorktree({ project, worktree: card.header.worktree })
                this.requireAssignmentWriter()(path, null)
            } finally {
                this.finishCardOperation(path)
            }

            return
        }

        this.requireValidRecord(worktree)
        if (!this.isWorktreeAvailableForCard(worktree, path)) throw new Error(`Worktree ${worktree} is already assigned to another active card`)

        const storage = this.requireStorage()
        if (!storage.prepareWorktree) throw new Error('Worktree preparation requires Electron local mode')
        const project = this.requireProject()
        const branchName = slugifyTitle(`${card.header.id}-${card.header.title}`, this.requireCardSeparator())
        const request = { branchName, project, worktree }
        this.pendingAssignments.set(worktree, path)
        this.startCardOperation(path)
        try {
            const records = await storage.prepareWorktree(request)
            if (this.requireProject() !== project) throw new Error('Opened project changed during worktree preparation')

            this.records = records
            this.requireAssignmentWriter()(path, worktree)
        } finally {
            this.pendingAssignments.delete(worktree)
            this.finishCardOperation(path)
        }
    }

    async refresh() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        this.records = storage.loadWorktrees ? await storage.loadWorktrees(project) : []
        this.dispatchChanged()

        return this.records
    }

    getCardCommitMessage(path: string) {
        const card = this.requireCard(path)

        return `${card.header.id}: ${card.header.title}`
    }

    async commitCardWorktree(path: string, message: string, push: boolean) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.commitWorktree) throw new Error('Worktree commits require Electron local mode')
        if (push && !storage.pushWorktree) throw new Error('Worktree pushes require Electron local mode')

        this.startCardOperation(path)
        try {
            this.records = await storage.commitWorktree({ message, project, worktree })
            if (push && storage.pushWorktree) this.records = await storage.pushWorktree({ project, worktree })
        } finally {
            this.finishCardOperation(path)
        }
    }

    async pushCardWorktree(path: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.pushWorktree) throw new Error('Worktree pushes require Electron local mode')

        this.startCardOperation(path)
        try {
            this.records = await storage.pushWorktree({ project, worktree })
        } finally {
            this.finishCardOperation(path)
        }
    }

    async pullCardWorktree(path: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.pullWorktree) throw new Error('Worktree pulls require Electron local mode')

        this.startCardOperation(path)
        try {
            this.records = await storage.pullWorktree({ project, worktree })
        } finally {
            this.finishCardOperation(path)
        }
    }

    async discardAndUnassignCardWorktree(path: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.discardWorktreeChanges) throw new Error('Discarding worktree changes requires Electron local mode')
        if (!storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')

        this.startCardOperation(path)
        try {
            this.records = await storage.discardWorktreeChanges({ project, worktree })
            this.records = await storage.parkWorktree({ project, worktree })
            this.requireAssignmentWriter()(path, null)
        } finally {
            this.finishCardOperation(path)
        }
    }

    async commitPushAndUnassignCardWorktree(path: string, message: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.commitWorktree) throw new Error('Worktree commits require Electron local mode')
        if (!storage.pushWorktree) throw new Error('Worktree pushes require Electron local mode')
        if (!storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')

        this.startCardOperation(path)
        try {
            this.records = await storage.commitWorktree({ message, project, worktree })
            this.records = await storage.pushWorktree({ project, worktree })
            this.records = await storage.parkWorktree({ project, worktree })
            this.requireAssignmentWriter()(path, null)
        } finally {
            this.finishCardOperation(path)
        }
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

    private activeCards() {
        return this.snapshotProvider?.()?.activeCards ?? []
    }

    private startCardOperation(path: string) {
        if (this.preparingCardPaths.has(path)) throw new Error(`Worktree operation is already in progress for ${path}`)

        this.preparingCardPaths.add(path)
        this.dispatchChanged()
    }

    private finishCardOperation(path: string) {
        this.preparingCardPaths.delete(path)
        this.dispatchChanged()
    }

    private requireCardOperation(path: string) {
        const card = this.requireCard(path)
        const worktree = card.header.worktree
        if (!Number.isInteger(worktree) || !worktree || worktree <= 0) throw new Error(`Card has no valid worktree assignment: ${path}`)

        this.requireValidRecord(worktree)

        return { project: this.requireProject(), storage: this.requireStorage(), worktree }
    }

    private requireAssignmentWriter() {
        if (!this.assignCardWorktreeValue) throw new Error('Worktree card assignment is not initialized')

        return this.assignCardWorktreeValue
    }

    private requireCard(path: string): ProjectCard {
        const snapshot = this.snapshotProvider?.()
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
        const card = cards.find((candidate) => candidate.path === path)
        if (!card) throw new Error(`Cannot assign a worktree to an unknown card: ${path}`)

        return card
    }

    private requireCardSeparator() {
        const cardSeparator = this.cardSeparatorProvider?.()
        if (!cardSeparator) throw new Error('Worktree card separator is not initialized')

        return cardSeparator
    }

    private requireValidRecord(worktree: number) {
        if (!Number.isInteger(worktree) || worktree <= 0) throw new Error(`Invalid card worktree index: ${String(worktree)}`)
        const record = this.records[worktree - 1]
        if (!record) throw new Error(`Configured worktree ${worktree} does not exist`)
        if (!record.valid) throw new Error(`Configured worktree ${worktree} is invalid: ${record.error}`)

        return record
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
