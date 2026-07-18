import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import { createDeferred, type CommitCallback } from '../services/test_support/data_service_test_support'

describe('CommitBatcher', () => {
    it('batches typing commits until the delay expires', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const onPendingChange = vi.fn()
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange,
            setDelay: window.setTimeout,
        })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update root')

        expect(commit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }], message: 'Update root' })
        expect(onPendingChange).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
    })

    it('flushes one logical change with the exact message on close', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        expect(batcher.hasPending()).toBe(true)

        await batcher.flush()

        expect(batcher.hasPending()).toBe(false)
        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ message: 'Update root' })
    })

    it('reports delayed commit failures and keeps pending files for retry', async () => {
        vi.useFakeTimers()
        const error = new Error('network down')
        const onFlushError = vi.fn()
        const commit = vi.fn<CommitCallback>(async () => {
            throw error
        })
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onFlushError,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        await vi.advanceTimersByTimeAsync(30000)

        expect(onFlushError).toHaveBeenCalledWith(error)
        expect(batcher.hasPending()).toBe(true)

        commit.mockImplementation(async () => undefined)
        await batcher.flush()

        expect(batcher.hasPending()).toBe(false)
        expect(commit).toHaveBeenCalledTimes(2)
    })

    it('combines distinct messages for a multi-file batch', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
        await batcher.flush()

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [
                { content: 'one', path: 'design/F-1-root.md' },
                { content: 'two', path: 'design/F-2-child.md' },
            ],
            message: 'Update 2 files\n\n- Update design/F-1-root.md\n- Update design/F-2-child.md',
        })
    })

    it('deduplicates repeated messages for the same path', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'three', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
        await batcher.flush()

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [
                { content: 'two', path: 'design/F-1-root.md' },
                { content: 'three', path: 'design/F-2-child.md' },
            ],
            message: 'Update 2 files\n\n- Update design/F-1-root.md\n- Update design/F-2-child.md',
        })
    })

    it('keeps newer content queued when typing continues during a commit', async () => {
        const firstCommit = createDeferred<void>()
        const commit = vi.fn<CommitCallback>()
            .mockImplementationOnce(async () => firstCommit.promise)
            .mockImplementationOnce(async () => undefined)
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })
        batcher.schedule('main', [{ content: 'old', path: 'actions/review.json' }], 'Update action')

        const pendingFlush = batcher.flush()
        batcher.schedule('main', [{ content: 'new', path: 'actions/review.json' }], 'Update action')
        firstCommit.resolve()
        await pendingFlush

        expect(batcher.hasPendingFile('actions/review.json')).toBe(true)
        expect(commit).toHaveBeenCalledTimes(1)
        await batcher.flush()
        expect(commit).toHaveBeenCalledTimes(2)
        expect(commit.mock.calls[1][0].files).toEqual([{ content: 'new', path: 'actions/review.json' }])
    })

    it('coalesces repeated path changes into one move with the latest content', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const onCommitted = vi.fn()
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })

        batcher.schedulePathChange('main', 'actions/new-action.json', {
            content: 'first',
            path: 'actions/review-c.json',
        }, 'Rename action', onCommitted)
        batcher.schedulePathChange('main', 'actions/new-action.json', {
            content: 'latest',
            path: 'actions/review-code.json',
        }, 'Rename action', onCommitted)
        await batcher.flush()

        expect(commit).toHaveBeenCalledOnce()
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [],
            moves: [{
                content: 'latest',
                fromPath: 'actions/new-action.json',
                toPath: 'actions/review-code.json',
            }],
        })
        expect(onCommitted).toHaveBeenCalledOnce()
        expect(onCommitted).toHaveBeenCalledWith('actions/new-action.json', 'actions/review-code.json')
    })

    it('retargets an uncommitted creation without scheduling a move', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const onCommitted = vi.fn()
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })
        batcher.schedule('main', [{ content: 'initial', path: 'actions/new-action.json' }], 'Create action')

        batcher.schedulePathChange('main', 'actions/new-action.json', {
            content: 'latest',
            path: 'actions/review-code.json',
        }, 'Rename action', onCommitted, false)
        await batcher.flush()

        expect(commit.mock.calls[0][0]).toEqual({
            branch: 'main',
            files: [{ content: 'latest', path: 'actions/review-code.json' }],
            message: 'Update 1 files\n\n- Create action\n- Rename action',
        })
        expect(onCommitted).toHaveBeenCalledWith('actions/new-action.json', 'actions/review-code.json')
    })

    it('rebases edits queued while a move is being committed', async () => {
        const firstCommit = createDeferred<void>()
        const commit = vi.fn<CommitCallback>()
            .mockImplementationOnce(async () => firstCommit.promise)
            .mockImplementationOnce(async () => undefined)
        const firstCommitted = vi.fn()
        const secondCommitted = vi.fn()
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })
        batcher.schedulePathChange('main', 'actions/new-action.json', {
            content: 'first',
            path: 'actions/review.json',
        }, 'Rename action', firstCommitted)

        const pendingFlush = batcher.flush()
        batcher.schedulePathChange('main', 'actions/new-action.json', {
            content: 'latest',
            path: 'actions/review-code.json',
        }, 'Rename action', secondCommitted)
        firstCommit.resolve()
        await pendingFlush
        await batcher.flush()

        expect(commit.mock.calls[1][0].moves).toEqual([{
            content: 'latest',
            fromPath: 'actions/review.json',
            toPath: 'actions/review-code.json',
        }])
        expect(firstCommitted).toHaveBeenCalledWith('actions/new-action.json', 'actions/review.json')
        expect(secondCommitted).toHaveBeenCalledWith('actions/review.json', 'actions/review-code.json')
    })

    it('discards a pending file without committing it', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit,
            delayMs: 30000,
            onPendingChange: vi.fn(),
            setDelay: window.setTimeout,
        })
        batcher.schedule('main', [{ content: 'draft', path: 'actions/review.json' }], 'Update action')

        batcher.discardPendingFile('actions/review.json')
        await vi.advanceTimersByTimeAsync(30000)

        expect(batcher.hasPendingFile('actions/review.json')).toBe(false)
        expect(commit).not.toHaveBeenCalled()
        vi.useRealTimers()
    })
})
