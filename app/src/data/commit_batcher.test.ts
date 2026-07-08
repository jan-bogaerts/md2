import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import type { CommitCallback } from '../services/test_support/data_service_test_support'

describe('CommitBatcher', () => {
    it('batches typing commits until the delay expires', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update root')

        expect(commit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }], message: 'Update root' })
        vi.useRealTimers()
    })

    it('flushes one logical change with the exact message on close', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

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
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

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
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

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
})
