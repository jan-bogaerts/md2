import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { MergeConflictSession } from '../../data/merge_conflict_types'
import { actionRunRegistry } from '../actions/action_run_registry'
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

function agentAction(): ActionDefinition {
    return {
        accessLevel: null,
        agent: null,
        appliesTo: { kind: 'merge-conflict' },
        approvalPolicy: null,
        builtin: false,
        command: null,
        description: 'Resolve conflicts',
        icon: null,
        id: 'resolve-conflicts',
        label: 'Resolve conflicts',
        model: null,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        phrases: [],
        prompt: 'Resolve {{conflict-files}}',
        sourcePath: 'actions/resolve-conflicts.json',
        thinkingLevel: null,
        trackFileChanges: false,
        streaming: false,
        type: 'agent',
    }
}

function createHarness(initialSession: MergeConflictSession | null = session()) {
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
    }
    const completeBranchCleanup = vi.fn()
    const reloadPaths = vi.fn(async () => undefined)
    const service = new MergeConflictService()
    service.init({ completeBranchCleanup, reloadPaths, storage: storage as never })

    return { changeCallback, completeBranchCleanup, reloadPaths, service, storage }
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

    it('launches resolver without assuming file resolved', async () => {
        const { service, storage } = createHarness()

        await service.launchResolver('src/one.ts')

        expect(storage.launchMergeConflictResolver).toHaveBeenCalledWith({ path: 'src/one.ts', sessionId: 'session-1' })
        expect(service.getSnapshot().session?.conflictedPaths).toEqual(['src/one.ts', 'src/two.ts'])
    })

    it('marks selected path then keeps current Git rescan result', async () => {
        const { service, storage } = createHarness()

        await service.markResolved('src/one.ts')

        expect(storage.markMergeConflictResolved).toHaveBeenCalledWith({ path: 'src/one.ts', sessionId: 'session-1' })
        expect(service.getSnapshot().session?.conflictedPaths).toEqual(['src/two.ts'])
    })

    it('runs only explicit merge conflict agent action and rescans after completion', async () => {
        const { service, storage } = createHarness()
        const startRun = vi.spyOn(actionRunRegistry, 'startRun').mockResolvedValue({ logs: [], status: 'completed' })

        await service.runAgent(agentAction(), 'src/one.ts')

        expect(startRun).toHaveBeenCalledWith(agentAction(), {
            conflictFile: 'src/one.ts',
            conflictFiles: 'src/one.ts\nsrc/two.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        })
        expect(storage.rescanMergeConflict).toHaveBeenCalledWith({ sessionId: 'session-1' })
        await expect(service.runAgent({ ...agentAction(), appliesTo: { kind: 'project' } })).rejects.toThrow('does not apply')
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
