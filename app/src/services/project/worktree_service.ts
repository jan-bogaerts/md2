import { slugifyTitle } from '../../data/card_naming'
import type { CardSeparator } from '../../data/card_identifiers'
import type {
    Card,
    ProjectReference,
    ProjectSnapshot,
    StorageService,
    WorktreeRecord,
    WorktreeState,
    WorktreeStatus,
} from '../../data/data_types'
import { register } from '../service_injector'

interface WorktreeServiceDependencies {
    assignCardWorktree: (path: string, worktree: number, branch: string) => void
    cardSeparatorProvider: () => CardSeparator
    clearCardBranch: (path: string) => void
    flushPendingChanges: () => Promise<void>
    projectFolderProvider: () => string
    projectProvider: () => ProjectReference | null
    snapshotProvider: () => ProjectSnapshot | null
    storageProvider: () => StorageService | null
    unassignCardWorktree: (path: string) => void
}

export class WorktreeService extends EventTarget {
    private adding = false
    private assignCardWorktreeValue: ((path: string, worktree: number, branch: string) => void) | null = null
    private cardSeparatorProvider: (() => CardSeparator) | null = null
    private clearCardBranchValue: ((path: string) => void) | null = null
    private error: string | null = null
    private flushPendingChanges: (() => Promise<void>) | null = null
    private pendingAssignments = new Map<number, string>()
    private preparingCardPaths = new Set<string>()
    private preparingProjectWorktree = false
    private projectActionWorktree: number | null = null
    private primaryStatus: WorktreeStatus | null = null
    private projectFolderProvider: (() => string) | null = null
    private projectProvider: (() => ProjectReference | null) | null = null
    private records: WorktreeRecord[] = []
    private snapshotProvider: (() => ProjectSnapshot | null) | null = null
    private storageProvider: (() => StorageService | null) | null = null
    private subscriptionCleanup: (() => void) | null = null
    private unassignCardWorktreeValue: ((path: string) => void) | null = null

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

    getPrimaryStatus() {
        return this.primaryStatus
    }

    /** The branch linked worktrees are rebased onto; null before a project is open. */
    getProjectBranch() {
        return this.projectProvider?.()?.branch ?? null
    }

    getError() {
        return this.error
    }

    isAdding() {
        return this.adding
    }

    isPreparingCard(path: string) {
        return this.preparingCardPaths.has(path)
    }

    isPreparingProjectWorktree() {
        return this.preparingProjectWorktree
    }

    isWorktreeAvailableForCard(worktree: number, cardPath: string) {
        const pendingOwner = this.pendingAssignments.get(worktree)
        if (pendingOwner && pendingOwner !== cardPath) return false

        return !this.activeCards().some((card) => card.path !== cardPath && card.header.worktree === worktree)
    }

    /** Whether the active storage backend can list worktrees (local desktop or a remote-controlled desktop). */
    isSupported() {
        return !!this.storageProvider?.()?.onWorktreesChanged
    }

    init(dependencies: WorktreeServiceDependencies) {
        this.subscriptionCleanup?.()
        this.assignCardWorktreeValue = dependencies.assignCardWorktree
        this.cardSeparatorProvider = dependencies.cardSeparatorProvider
        this.clearCardBranchValue = dependencies.clearCardBranch
        this.flushPendingChanges = dependencies.flushPendingChanges
        this.projectFolderProvider = dependencies.projectFolderProvider
        this.projectProvider = dependencies.projectProvider
        this.snapshotProvider = dependencies.snapshotProvider
        this.storageProvider = dependencies.storageProvider
        this.unassignCardWorktreeValue = dependencies.unassignCardWorktree
        this.clear()
        this.subscriptionCleanup = dependencies.storageProvider()?.onWorktreesChanged?.((state) => this.handleState(state)) ?? null
    }

    clear() {
        this.projectActionWorktree = null
        this.primaryStatus = null
        this.error = null
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
                this.requireUnassignmentWriter()(path)
                return
            }

            const storage = this.requireStorage()
            if (!storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')
            const project = this.requireProject()
            this.startCardOperation(path)
            try {
                await storage.parkWorktree({ project, worktree: card.header.worktree })
                this.requireUnassignmentWriter()(path)
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
            await storage.prepareWorktree(request)
            if (this.requireProject() !== project) throw new Error('Opened project changed during worktree preparation')

            this.requireAssignmentWriter()(path, worktree, branchName)
        } finally {
            this.pendingAssignments.delete(worktree)
            this.finishCardOperation(path)
        }
    }

    async refresh() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        if (!storage.refreshWorktrees) throw new Error('Refreshing worktrees requires Electron local mode')
        await storage.refreshWorktrees(project)
    }

    getCardCommitMessage(path: string) {
        const card = this.requireCard(path)

        return `${card.header.id}: ${card.header.title}`
    }

    async commitCardWorktree(path: string, message: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.commitWorktree) throw new Error('Worktree commits require Electron local mode')

        this.startCardOperation(path)
        try {
            await storage.commitWorktree({ message, project, worktree })
        } finally {
            this.finishCardOperation(path)
        }
    }

    async integrateCardWorktree(path: string, deleteBranch: boolean) {
        const { card, project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.integrateWorktree) throw new Error('Worktree integration requires Electron local mode')
        if (!card.header.internalId) throw new Error(`Cannot integrate card without an internal ID: ${path}`)
        const branch = card.header.branch
        if (deleteBranch && !branch) throw new Error(`Cannot delete branch without stored branch identity: ${path}`)
        if (deleteBranch && !storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')
        if (deleteBranch && !storage.deleteLocalBranch) throw new Error('Local branch deletion requires Electron local mode')
        const projectFolder = this.requireProjectFolder()

        this.startCardOperation(path)
        try {
            await this.requirePendingChangesFlusher()()
            await storage.integrateWorktree({ cardInternalId: card.header.internalId, project, projectFolder, worktree })
            if (deleteBranch && branch) {
                try {
                    if (!storage.parkWorktree || !storage.deleteLocalBranch) throw new Error('Branch cleanup is not available')
                    await storage.parkWorktree({ project, worktree })
                    this.requireUnassignmentWriter()(path)
                    await storage.deleteLocalBranch(project, branch)
                    this.requireBranchClearer()(path)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    throw new Error(`Worktree integrated, but branch cleanup failed: ${message}`, { cause: error })
                }
            }
        } finally {
            this.finishCardOperation(path)
        }
    }

    async updateCardWorktree(path: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.rebaseWorktree) throw new Error('Worktree updates require Electron local mode')

        this.startCardOperation(path)
        try {
            await this.requirePendingChangesFlusher()()
            await storage.rebaseWorktree({ project, worktree })
        } finally {
            this.finishCardOperation(path)
        }
    }

    getProjectCommitMessage() {
        return `Update ${this.getProjectBranch() ?? 'worktree'}`
    }

    async commitProjectWorktree(message: string) {
        const { project, storage, worktree } = this.requireProjectOperation()
        if (!storage.commitWorktree) throw new Error('Worktree commits require Electron local mode')

        this.startProjectOperation()
        try {
            await storage.commitWorktree({ message, project, worktree })
        } finally {
            this.finishProjectOperation()
        }
    }

    async integrateProjectWorktree() {
        const { project, storage, worktree } = this.requireProjectOperation()
        if (!storage.integrateWorktree) throw new Error('Worktree integration requires Electron local mode')

        this.startProjectOperation()
        try {
            await this.requirePendingChangesFlusher()()
            await storage.integrateWorktree({ project, worktree })
        } finally {
            this.finishProjectOperation()
        }
    }

    async updateProjectWorktree() {
        const { project, storage, worktree } = this.requireProjectOperation()
        if (!storage.rebaseWorktree) throw new Error('Worktree updates require Electron local mode')

        this.startProjectOperation()
        try {
            await this.requirePendingChangesFlusher()()
            await storage.rebaseWorktree({ project, worktree })
        } finally {
            this.finishProjectOperation()
        }
    }

    async discardAndUnassignCardWorktree(path: string) {
        const { project, storage, worktree } = this.requireCardOperation(path)
        if (!storage.discardWorktreeChanges) throw new Error('Discarding worktree changes requires Electron local mode')
        if (!storage.parkWorktree) throw new Error('Worktree parking requires Electron local mode')

        this.startCardOperation(path)
        try {
            await storage.discardWorktreeChanges({ project, worktree })
            await storage.parkWorktree({ project, worktree })
            this.requireUnassignmentWriter()(path)
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
            const added = await storage.addWorktree(project)

            return added
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

        await storage.removeWorktree(project, this.records[index].path)
    }

    private requireProject() {
        const project = this.projectProvider?.()
        if (!project) throw new Error('Cannot save worktrees before a project is open')

        return project
    }

    private handleState(state: WorktreeState) {
        const project = this.projectProvider?.()
        if (!project || !state.project || project.id !== state.project.id || project.branch !== state.project.branch) return
        const recordsChanged = JSON.stringify(this.records) !== JSON.stringify(state.records)
        const primaryStatusChanged = JSON.stringify(this.primaryStatus) !== JSON.stringify(state.primaryStatus)
        if (!recordsChanged && !primaryStatusChanged && this.error === state.error) return

        if (recordsChanged) this.records = state.records
        if (primaryStatusChanged) this.primaryStatus = state.primaryStatus
        this.error = state.error
        this.dispatchChanged()
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
        const snapshot = this.snapshotProvider?.()
        if (!snapshot) throw new Error('Worktree project snapshot is not initialized')
        const worktree = card.header.worktree
        if (!Number.isInteger(worktree) || !worktree || worktree <= 0) throw new Error(`Card has no valid worktree assignment: ${path}`)

        this.requireValidRecord(worktree)

        return { card, project: this.requireProject(), storage: this.requireStorage(), worktree }
    }

    private startProjectOperation() {
        if (this.preparingProjectWorktree) throw new Error('Worktree operation is already in progress for the project')

        this.preparingProjectWorktree = true
        this.dispatchChanged()
    }

    private finishProjectOperation() {
        this.preparingProjectWorktree = false
        this.dispatchChanged()
    }

    private requireProjectOperation() {
        const worktree = this.projectActionWorktree
        if (!Number.isInteger(worktree) || !worktree || worktree <= 0) throw new Error('No worktree is assigned to the project')

        this.requireValidRecord(worktree)

        return { project: this.requireProject(), storage: this.requireStorage(), worktree }
    }

    private requireAssignmentWriter() {
        if (!this.assignCardWorktreeValue) throw new Error('Worktree card assignment is not initialized')

        return this.assignCardWorktreeValue
    }

    private requireBranchClearer() {
        if (!this.clearCardBranchValue) throw new Error('Worktree card branch cleanup is not initialized')

        return this.clearCardBranchValue
    }

    private requireUnassignmentWriter() {
        if (!this.unassignCardWorktreeValue) throw new Error('Worktree card unassignment is not initialized')

        return this.unassignCardWorktreeValue
    }

    private requireProjectFolder() {
        const projectFolder = this.projectFolderProvider?.()
        if (typeof projectFolder !== 'string') throw new Error('Worktree project folder is not initialized')

        return projectFolder
    }

    private requireCard(path: string): Card {
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

    private requirePendingChangesFlusher() {
        if (!this.flushPendingChanges) throw new Error('Worktree pending-change flusher is not initialized')

        return this.flushPendingChanges
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const worktreeService = new WorktreeService()
