import { slugifyTitle } from '../../data/card_naming'
import type { CardSeparator } from '../../data/card_identifiers'
import { getElectronActionBridge, type WorktreeDiffResult } from '../../data/electron_action_bridge'
import type {
    Card,
    ProjectReference,
    ProjectSnapshot,
    StorageService,
    WorktreeRecord,
    WorktreeRemovalMode,
    WorktreeState,
    WorktreeStatus,
} from '../../data/data_types'
import { register } from '../service_injector'
import { PrimaryWorktreeSelectionError } from './worktree_errors'

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

/** A staged removal keeps the folder disposition chosen in the confirmation dialog until Save applies it. */
export interface WorktreeDraftRemoval {
    mode: WorktreeRemovalMode
    path: string
}

export interface WorktreeDraft {
    additions: string[]
    applying: boolean
    records: WorktreeRecord[]
    removals: WorktreeDraftRemoval[]
    selecting: boolean
}

function worktreePathKey(folderPath: string) {
    return folderPath.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
}

/** Same outgoing-status condition used by worktree integration and diff controls. */
export function isWorktreeIntegratable(record: WorktreeRecord | null | undefined) {
    return !!record?.valid && (record.status.dirty || record.status.baseAhead > 0)
}

export class WorktreeService extends EventTarget {
    private assignCardWorktreeValue: ((path: string, worktree: number, branch: string) => void) | null = null
    private cardSeparatorProvider: (() => CardSeparator) | null = null
    private clearCardBranchValue: ((path: string) => void) | null = null
    private error: string | null = null
    private draft: WorktreeDraft | null = null
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

    getDraft() {
        return this.draft
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

    /** Whether card has same valid outgoing worktree state required by integration. */
    canIntegrateCardWorktree(path: string) {
        const card = this.findCard(path)
        const worktree = card?.header.worktree
        if (!Number.isInteger(worktree) || !worktree || worktree <= 0 || card?.header.worktreeError) return false
        const record = this.records[worktree - 1]

        return isWorktreeIntegratable(record)
    }

    /** Load current diff for card's assigned worktree without changing operation state. */
    async generateCardWorktreeDiff(path: string): Promise<WorktreeDiffResult> {
        const { worktree } = this.requireCardOperation(path)
        if (!this.canIntegrateCardWorktree(path)) throw new Error('Card worktree has no changes to integrate')
        const bridge = getElectronActionBridge()
        if (!bridge?.generateWorktreeDiff) throw new Error('Worktree diff requires Electron local mode')

        return bridge.generateWorktreeDiff({ worktree })
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
        this.draft = null
        this.projectActionWorktree = null
        this.primaryStatus = null
        this.error = null
        this.records = []
        this.dispatchChanged()
    }

    startDraft() {
        if (this.draft) return

        this.draft = { additions: [], applying: false, records: this.records, removals: [], selecting: false }
        this.dispatchChanged()
    }

    discardDraft() {
        if (!this.draft) return

        this.draft = null
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
        const projectFolder = this.requireProjectFolder()

        this.startCardOperation(path)
        try {
            await this.requirePendingChangesFlusher()()
            const request = {
                ...(branch ? { branchName: branch } : {}),
                cardInternalId: card.header.internalId,
                deleteBranch,
                project,
                projectFolder,
                worktree,
            }
            const outcome = await storage.integrateWorktree(request)
            if (outcome.status === 'completed' && deleteBranch) {
                this.requireUnassignmentWriter()(path)
                this.requireBranchClearer()(path)
            }

            return outcome
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
            const outcome = await storage.rebaseWorktree({ project, worktree })

            return outcome
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
            const outcome = await storage.integrateWorktree({ project, worktree })

            return outcome
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
            const outcome = await storage.rebaseWorktree({ project, worktree })

            return outcome
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

    async selectDraftAddition() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        const draft = this.requireDraft()
        if (!storage.selectWorktreeFolder) throw new Error('Worktree folder selection requires Electron local mode')
        if (draft.selecting) throw new Error('Worktree folder selection is already in progress')
        if (draft.applying) throw new Error('Worktree draft is being applied')

        this.replaceDraft({ ...draft, selecting: true })
        try {
            const folderPath = await storage.selectWorktreeFolder()
            if (folderPath === null) return null
            if (folderPath.length === 0) throw new Error('Missing linked worktree folder')

            const pathKey = worktreePathKey(folderPath)
            const currentDraft = this.requireDraft()
            if (typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing primary project rootPath')
            if (pathKey === worktreePathKey(project.rootPath)) throw new PrimaryWorktreeSelectionError()
            if (currentDraft.records.some(({ path }) => worktreePathKey(path) === pathKey)) throw new Error('Folder is already a linked worktree')
            if (currentDraft.additions.some((path) => worktreePathKey(path) === pathKey)) throw new Error('Folder is already pending addition')

            this.replaceDraft({ ...currentDraft, additions: [...currentDraft.additions, folderPath] })

            return folderPath
        } finally {
            const currentDraft = this.draft
            if (currentDraft) this.replaceDraft({ ...currentDraft, selecting: false })
        }
    }

    stageDraftRemoval(folderPath: string, mode: WorktreeRemovalMode = 'folder') {
        const draft = this.requireEditableDraft()
        const pathKey = worktreePathKey(folderPath)
        const pendingAddition = draft.additions.find((path) => worktreePathKey(path) === pathKey)
        if (pendingAddition) {
            this.replaceDraft({ ...draft, additions: draft.additions.filter((path) => path !== pendingAddition) })
            return
        }

        const record = draft.records.find(({ path }) => worktreePathKey(path) === pathKey)
        if (!record) throw new Error('Worktree removal target no longer exists')
        if (draft.removals.some((removal) => worktreePathKey(removal.path) === pathKey)) return

        this.replaceDraft({ ...draft, removals: [...draft.removals, { mode, path: record.path }] })
    }

    async applyDraft() {
        const storage = this.requireStorage()
        const project = this.requireProject()
        const draft = this.requireEditableDraft()
        if (!storage.addWorktree) throw new Error('Worktree creation requires Electron local mode')
        if (!storage.removeWorktree) throw new Error('Worktree removal requires Electron local mode')
        if (!storage.refreshWorktrees) throw new Error('Worktree refresh requires Electron local mode')

        this.replaceDraft({ ...draft, applying: true })
        try {
            for (const removal of draft.removals) {
                await storage.removeWorktree(project, removal.path, removal.mode)
                const currentDraft = this.draft
                if (currentDraft) {
                    this.replaceDraft({
                        ...currentDraft,
                        removals: currentDraft.removals.filter((candidate) => candidate.path !== removal.path),
                    })
                }
            }
            for (const folderPath of draft.additions) {
                await storage.addWorktree(project, folderPath)
                const currentDraft = this.draft
                if (currentDraft) {
                    this.replaceDraft({
                        ...currentDraft,
                        additions: currentDraft.additions.filter((path) => path !== folderPath),
                    })
                }
            }
        } catch (error) {
            await storage.refreshWorktrees(project)
            throw error
        } finally {
            const currentDraft = this.draft
            if (currentDraft) this.replaceDraft({ ...currentDraft, applying: false })
        }
    }

    private requireDraft() {
        if (!this.draft) throw new Error('Worktree draft is not initialized')

        return this.draft
    }

    private requireEditableDraft() {
        const draft = this.requireDraft()
        if (draft.applying) throw new Error('Worktree draft is being applied')

        return draft
    }

    private replaceDraft(draft: WorktreeDraft) {
        this.draft = draft
        this.dispatchChanged()
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
        if (recordsChanged && this.draft) this.draft = { ...this.draft, records: state.records }
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
        const card = this.findCard(path)
        if (!card) throw new Error(`Cannot assign a worktree to an unknown card: ${path}`)

        return card
    }

    private findCard(path: string) {
        const snapshot = this.snapshotProvider?.()
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

        return cards.find((candidate) => candidate.path === path)
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
