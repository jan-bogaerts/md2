import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MergeConflictSession } from '../../data/merge_conflict_types'
import { MergeConflictService } from './merge_conflict_service'

function session(paths = ['src/one.ts', 'src/two.ts']): MergeConflictSession {
    return {
        conflictedPaths: paths,
        externalResolverConfigured: true,
        id: 'session-1',
        operation: 'integrate',
        phase: 'squash',
        repositoryRoot: 'C:/repo',
        worktree: 1,
    }
}

function createHarness(initialSession: MergeConflictSession | null = session(), storageOverrides: Record<string, unknown> = {}) {
    let changeCallback: (value: MergeConflictSession | null) => void = () => undefined
    const storage = {
        abortMergeConflict: vi.fn(async () => undefined),
        continueMergeConflict: vi.fn(async () => ({ branchDeleted: true, cardInternalId: 'card-1', status: 'completed' as const })),
        getMergeConflictSession: vi.fn(async () => initialSession),
        launchMergeConflictResolver: vi.fn(async () => undefined),
        markMergeConflictResolved: vi.fn(async () => session(['src/two.ts'])),
        onMergeConflictSessionChanged: vi.fn((callback: typeof changeCallback) => {
            changeCallback = callback
            callback(initialSession)

            return vi.fn()
        }),
        rescanMergeConflict: vi.fn(async () => session(['src/two.ts'])),
        ...storageOverrides,
    }
    const completeBranchCleanup = vi.fn()
    const reloadPaths = vi.fn(async () => undefined)
    const reportError = vi.fn()
    const service = new MergeConflictService()
    service.init({ completeBranchCleanup, reloadPaths, reportError, storage: storage as never })

    return { changeCallback, completeBranchCleanup, reloadPaths, reportError, service, storage }
}

describe('MergeConflictService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('loads and publishes desktop session with stable snapshots', async () => {
        const { service, storage } = createHarness(null)
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        await service.load()

        expect(storage.getMergeConflictSession).toHaveBeenCalled()
        expect(service.getSnapshot()).toEqual({ busy: false, session: null })
        expect(service.getSnapshot()).toBe(service.getSnapshot())
    })

    it('launches resolver then verifies current Git conflict state', async () => {
        const { service, storage } = createHarness()

        await service.launchResolver('src/one.ts')

        expect(storage.launchMergeConflictResolver).toHaveBeenCalledWith({ path: 'src/one.ts', sessionId: 'session-1' })
        expect(storage.getMergeConflictSession).toHaveBeenCalled()
        expect(service.getSnapshot().session?.conflictedPaths).toEqual(['src/one.ts', 'src/two.ts'])
    })

    it('reloads affected paths before closing an externally ended session', async () => {
        const { reloadPaths, service, storage } = createHarness()
        await service.load()
        storage.getMergeConflictSession.mockResolvedValueOnce(null)

        await service.verifyCurrentSession()

        expect(reloadPaths).toHaveBeenCalledWith(['src/one.ts', 'src/two.ts'])
        expect(service.getSnapshot().session).toBeNull()
    })

    it('keeps the last known session when external-session reconciliation fails', async () => {
        const { reloadPaths, service, storage } = createHarness()
        await service.load()
        storage.getMergeConflictSession.mockResolvedValueOnce(null)
        reloadPaths.mockRejectedValueOnce(new Error('reload failed'))

        await expect(service.verifyCurrentSession()).rejects.toThrow('reload failed')

        expect(service.getSnapshot().session).toEqual(session())
    })

    it('reports initial conflict-session load failures', async () => {
        const getMergeConflictSession = vi.fn(async () => {
            throw new Error('verify failed')
        })
        const { reportError } = createHarness(null, { getMergeConflictSession })

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'verify failed' })))
    })

    it('reconciles a restored session that Git reports as externally ended', async () => {
        const getMergeConflictSession = vi.fn(async () => null)
        const { reloadPaths, service } = createHarness(session(), { getMergeConflictSession })

        await vi.waitFor(() => expect(service.getSnapshot().session).toBeNull())

        expect(reloadPaths).toHaveBeenCalledWith(['src/one.ts', 'src/two.ts'])
    })

    it('marks selected path then keeps current Git rescan result', async () => {
        const { service, storage } = createHarness()

        await service.markResolved('src/one.ts')

        expect(storage.markMergeConflictResolved).toHaveBeenCalledWith({ path: 'src/one.ts', sessionId: 'session-1' })
        expect(service.getSnapshot().session?.conflictedPaths).toEqual(['src/two.ts'])
    })

    it('builds canonical per-file and resolve-all action contexts', () => {
        const { service } = createHarness()

        expect(service.createActionContext('src/one.ts')).toEqual({
            conflictFile: 'src/one.ts',
            conflictFiles: 'src/one.ts\nsrc/two.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        })
        expect(service.createActionContext()).toEqual({
            conflictFiles: 'src/one.ts\nsrc/two.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        })
    })

    it('rescans only matching active session', async () => {
        const { changeCallback, service, storage } = createHarness()

        await service.rescanSession('session-1')

        expect(storage.rescanMergeConflict).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(service.getSnapshot().session?.conflictedPaths).toEqual(['src/two.ts'])

        changeCallback({ ...session(), id: 'session-2' })
        await service.rescanSession('session-1')
        expect(storage.rescanMergeConflict).toHaveBeenCalledOnce()
    })

    it('does not apply late rescan result after session changes', async () => {
        let finishRescan: (value: MergeConflictSession) => void = () => undefined
        const { changeCallback, service, storage } = createHarness()
        await service.load()
        storage.rescanMergeConflict.mockImplementationOnce(() => new Promise((resolve) => {
            finishRescan = resolve
        }))

        const rescan = service.rescanSession('session-1')
        changeCallback({ ...session(['src/new.ts']), id: 'session-2' })
        finishRescan(session(['src/two.ts']))
        await rescan

        expect(service.getSnapshot().session).toEqual({ ...session(['src/new.ts']), id: 'session-2' })
    })

    it('keeps current session visible when rescan fails', async () => {
        const { service, storage } = createHarness()
        await service.load()
        storage.rescanMergeConflict.mockRejectedValueOnce(new Error('rescan failed'))

        await expect(service.rescanSession('session-1')).rejects.toThrow('rescan failed')

        expect(service.getSnapshot()).toEqual({ busy: false, session: session() })
    })

    it('continues only with no unmerged paths and reloads every path seen in session', async () => {
        const { completeBranchCleanup, reloadPaths, service, storage } = createHarness()
        await expect(service.continue()).rejects.toThrow('Resolve every conflicted file')
        await service.markResolved('src/one.ts')
        storage.markMergeConflictResolved.mockResolvedValueOnce(session([]))
        await service.markResolved('src/two.ts')

        await service.continue()

        expect(storage.continueMergeConflict).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(completeBranchCleanup).toHaveBeenCalledWith('card-1')
        expect(reloadPaths).toHaveBeenCalledWith(['src/one.ts', 'src/two.ts'])
        expect(service.getSnapshot().session).toBeNull()
    })

    it('aborts session and reloads affected paths', async () => {
        const { reloadPaths, service, storage } = createHarness()

        await service.abort()

        expect(storage.abortMergeConflict).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(reloadPaths).toHaveBeenCalledWith(['src/one.ts', 'src/two.ts'])
        expect(service.getSnapshot().session).toBeNull()
    })
})
