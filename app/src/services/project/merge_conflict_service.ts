import type { ActionContext } from '../../data/action_context'
import type { StorageService } from '../../data/data_types'
import type { MergeConflictSession } from '../../data/merge_conflict_types'
import { register } from '../service_injector'

export interface MergeConflictSnapshot {
    busy: boolean
    session: MergeConflictSession | null
}

interface MergeConflictServiceDependencies {
    completeBranchCleanup(cardInternalId: string): void
    reloadPaths(paths: string[]): Promise<void>
    storage: StorageService
}

/** Renderer owner for active desktop conflict state and resolution operations. */
export class MergeConflictService extends EventTarget {
    private affectedPaths: Set<string> = new Set()
    private dependencies: MergeConflictServiceDependencies | null = null
    private snapshot: MergeConflictSnapshot = { busy: false, session: null }
    private unsubscribe: (() => void) | null = null

    constructor() {
        super()
        register('mergeConflictService', this)
    }

    init(dependencies: MergeConflictServiceDependencies) {
        this.unsubscribe?.()
        this.dependencies = dependencies
        this.affectedPaths = new Set()
        const { storage } = dependencies
        this.publish({ busy: false, session: null })
        if (!storage.getMergeConflictSession || !storage.onMergeConflictSessionChanged) return

        this.unsubscribe = storage.onMergeConflictSessionChanged((session) => this.handleSessionChanged(session))
        void this.load()
    }

    clear() {
        this.unsubscribe?.()
        this.unsubscribe = null
        this.dependencies = null
        this.affectedPaths.clear()
        this.publish({ busy: false, session: null })
    }

    getSnapshot() {
        return this.snapshot
    }

    isConflictedPath(path: string) {
        return this.snapshot.session?.conflictedPaths.includes(path) ?? false
    }

    async load() {
        const { storage } = this.requireDependencies()
        if (!storage.getMergeConflictSession) return
        const session = await storage.getMergeConflictSession()
        this.handleSessionChanged(session)
    }

    async launchResolver(path: string) {
        const { storage } = this.requireDependencies()
        const session = this.requireSession()
        if (!storage.launchMergeConflictResolver) throw new Error('External merge conflict resolver requires desktop')
        this.setBusy(true)
        try {
            await storage.launchMergeConflictResolver({ path, sessionId: session.id })
        } finally {
            this.setBusy(false)
        }
    }

    async markResolved(path: string) {
        const { storage } = this.requireDependencies()
        const session = this.requireSession()
        if (!storage.markMergeConflictResolved) throw new Error('Marking merge conflicts resolved requires desktop')
        this.setBusy(true)
        try {
            const nextSession = await storage.markMergeConflictResolved({ path, sessionId: session.id })
            this.publish({ busy: true, session: nextSession })
        } finally {
            this.setBusy(false)
        }
    }

    createActionContext(path?: string): ActionContext {
        const session = this.requireSession()

        return {
            ...(path ? { conflictFile: path } : {}),
            conflictFiles: session.conflictedPaths.join('\n'),
            conflictSessionId: session.id,
            kind: 'merge-conflict',
        }
    }

    async rescanSession(sessionId: string) {
        const { storage } = this.requireDependencies()
        if (this.snapshot.session?.id !== sessionId) return
        if (!storage.rescanMergeConflict) throw new Error('Rescanning merge conflicts requires desktop')
        this.setBusy(true)
        try {
            const nextSession = await storage.rescanMergeConflict({ sessionId })
            if (this.snapshot.session?.id !== sessionId) return

            this.publish({ ...this.snapshot, session: nextSession })
        } finally {
            if (this.snapshot.session?.id === sessionId) this.setBusy(false)
        }
    }

    async continue() {
        const dependencies = this.requireDependencies()
        const session = this.requireSession()
        if (!dependencies.storage.continueMergeConflict) throw new Error('Continuing merge conflicts requires desktop')
        if (session.conflictedPaths.length > 0) throw new Error('Resolve every conflicted file before continuing')
        const affectedPaths = [...this.affectedPaths]
        this.setBusy(true)
        try {
            const outcome = await dependencies.storage.continueMergeConflict({ sessionId: session.id })
            if (outcome.status === 'conflict') {
                this.publish({ busy: true, session: outcome.session })
                return
            }
            if (outcome.branchDeleted && outcome.cardInternalId) dependencies.completeBranchCleanup(outcome.cardInternalId)
            await dependencies.reloadPaths(affectedPaths)
            this.affectedPaths.clear()
            this.publish({ busy: true, session: null })
        } finally {
            this.setBusy(false)
        }
    }

    async abort() {
        const dependencies = this.requireDependencies()
        const session = this.requireSession()
        if (!dependencies.storage.abortMergeConflict) throw new Error('Aborting merge conflicts requires desktop')
        const affectedPaths = [...this.affectedPaths]
        this.setBusy(true)
        try {
            await dependencies.storage.abortMergeConflict({ sessionId: session.id })
            await dependencies.reloadPaths(affectedPaths)
            this.affectedPaths.clear()
            this.publish({ busy: true, session: null })
        } finally {
            this.setBusy(false)
        }
    }

    private handleSessionChanged(session: MergeConflictSession | null) {
        this.publish({ ...this.snapshot, session })
    }

    private setBusy(busy: boolean) {
        this.publish({ ...this.snapshot, busy })
    }

    private publish(snapshot: MergeConflictSnapshot) {
        if (this.snapshot.busy === snapshot.busy && this.snapshot.session === snapshot.session) return
        for (const path of snapshot.session?.conflictedPaths ?? []) this.affectedPaths.add(path)
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<MergeConflictSnapshot>('changed', { detail: snapshot }))
    }

    private requireDependencies() {
        if (!this.dependencies) throw new Error('Merge conflict service is not initialized')

        return this.dependencies
    }

    private requireSession() {
        const session = this.snapshot.session
        if (!session) throw new Error('No active merge conflict session')

        return session
    }
}

export const mergeConflictService = new MergeConflictService()
