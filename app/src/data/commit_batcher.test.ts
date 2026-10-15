import { describe, expect, it, vi } from 'vitest'
import {
    COMMIT_BATCHER_FLUSH_FAILED_EVENT,
    COMMIT_BATCHER_PENDING_CHANGED_EVENT,
    CommitBatcher,
} from './commit_batcher'
import { createDeferred, type CommitCallback } from '../services/test_support/data_service_test_support'
import { markdownParsingService } from '../services/data/markdown_parsing_service'
import type { Card, CommitRequest, WriteFilesRequest } from './data_types'

type PushCallback = (request: CommitRequest) => Promise<unknown>
type WriteCallback = (request: WriteFilesRequest) => Promise<unknown>

function createBatcher(
    commit: CommitCallback,
    push: PushCallback = vi.fn(async () => undefined),
    delayMs = 30000,
    requireCardByInternalId: (internalId: string) => Card = () => { throw new Error('Unexpected card lookup') },
    writeFiles: WriteCallback = vi.fn(async () => undefined),
) {
    const cardOperations = { commitFiles: commit, pushCommittedFiles: push, requireCardByInternalId, writeFiles }

    return new CommitBatcher(cardOperations, () => delayMs)
}

describe('CommitBatcher', () => {
    it('batches renamed diagram JSON and index under stable diagram identity', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const persisted = vi.fn()
        const batcher = createBatcher(commit)
        batcher.schedule('main', [
            { content: 'first', diagramId: 'diagram-1', kind: 'diagram', onPersisted: persisted, path: 'design/diagrams/first-diagram-1.json', sourcePath: 'design/diagrams/original-diagram-1.json' },
            { content: 'first-index', kind: 'file', path: 'design/diagrams/diagram-view.json' },
        ], 'Save diagram')
        batcher.schedule('main', [
            { content: 'second', diagramId: 'diagram-1', kind: 'diagram', onPersisted: persisted, path: 'design/diagrams/second-diagram-1.json', sourcePath: 'design/diagrams/original-diagram-1.json' },
            { content: 'second-index', kind: 'file', path: 'design/diagrams/diagram-view.json' },
        ], 'Save diagram')

        await batcher.flush()

        expect(commit).toHaveBeenCalledOnce()
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [{ content: 'second-index', path: 'design/diagrams/diagram-view.json' }],
            moves: [{ content: 'second', fromPath: 'design/diagrams/original-diagram-1.json', toPath: 'design/diagrams/second-diagram-1.json' }],
        })
        expect(persisted).toHaveBeenCalledOnce()
    })

    it('sends commit-only paths in request paths without file content', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        const activityPath = 'design/activity/card__card-1.json'
        batcher.schedule('main', [{ kind: 'path', path: activityPath }], 'Update conversation view state')
        batcher.schedule('main', [{ content: 'card', kind: 'file', path: 'card.md' }], 'Update card')

        await batcher.flush()

        expect(commit.mock.calls[0][0].paths).toEqual([activityPath])
        expect(commit.mock.calls[0][0].files).toEqual([{ content: 'card', path: 'card.md' }])
    })

    it('coalesces repeated schedules for one commit-only path into one entry', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        const activityPath = 'design/activity/card__card-1.json'
        batcher.schedule('main', [{ kind: 'path', path: activityPath }], 'Update conversation view state')
        batcher.schedule('main', [{ kind: 'path', path: activityPath }], 'Update conversation view state')

        expect(batcher.describePendingChanges()).toHaveLength(1)
        await batcher.flush()

        expect(commit.mock.calls[0][0]).toEqual({
            branch: 'main',
            files: [],
            message: 'Update conversation view state',
            paths: [activityPath],
        })
    })

    it('restores a commit-only path after a failed flush', async () => {
        const commit = vi.fn<CommitCallback>()
            .mockRejectedValueOnce(new Error('commit failed'))
            .mockResolvedValue(undefined)
        const batcher = createBatcher(commit)
        const activityPath = 'design/activity/card__card-1.json'
        batcher.schedule('main', [{ kind: 'path', path: activityPath }], 'Update conversation view state')

        await expect(batcher.flush()).rejects.toThrow('commit failed')
        expect(batcher.hasPendingFile(activityPath)).toBe(true)
        await batcher.flush()

        expect(commit.mock.calls[1][0].paths).toEqual([activityPath])
    })

    it('serializes one owned card reference once with latest fields at flush', async () => {
        const card = { header: { status: 'design' }, path: 'design/F-1-root.md' } as Card
        const serializeCard = vi.spyOn(markdownParsingService, 'serializeCard').mockImplementation((currentCard: Card) => ({
            content: `status: ${currentCard.header.status}`,
            path: currentCard.path,
        }))
        const acknowledgeCard = vi.spyOn(markdownParsingService, 'acknowledgeSerializedCard').mockImplementation(() => undefined)
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit, undefined, undefined, () => card)
        const change = { cardInternalId: 'card-1', kind: 'card' as const, path: card.path }

        batcher.schedule('main', [change], 'Update card')
        card.header.status = 'ready'
        batcher.schedule('main', [change], 'Update card')
        await batcher.flush()

        expect(serializeCard).toHaveBeenCalledOnce()
        expect(commit.mock.calls[0][0].files).toEqual([{ content: 'status: ready', path: card.path }])
        expect(acknowledgeCard).toHaveBeenCalledOnce()
        serializeCard.mockRestore()
        acknowledgeCard.mockRestore()
    })

    it('resolves the current owned card by internal ID when flushing', async () => {
        const originalCard = { header: { status: 'design' }, path: 'design/F-1-root.md' } as Card
        const currentCard = { header: { status: 'ready' }, path: originalCard.path } as Card
        const serializeCard = vi.spyOn(markdownParsingService, 'serializeCard').mockImplementation((card: Card) => ({
            content: `status: ${card.header.status}`,
            path: card.path,
        }))
        const acknowledgeCard = vi.spyOn(markdownParsingService, 'acknowledgeSerializedCard').mockImplementation(() => undefined)
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit, undefined, undefined, () => currentCard)

        batcher.schedule('main', [{ cardInternalId: 'card-1', kind: 'card', path: originalCard.path }], 'Update card')
        await batcher.flush()

        expect(commit.mock.calls[0][0].files[0].content).toBe('status: ready')
        expect(acknowledgeCard).toHaveBeenCalledWith(currentCard, commit.mock.calls[0][0].files[0])
        serializeCard.mockRestore()
        acknowledgeCard.mockRestore()
    })

    it('does not auto-flush while a combined card change is being assembled', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit, undefined, 100)
        const resumeAutomaticFlush = batcher.deferAutomaticFlush()
        batcher.schedule('main', [{ content: 'moved', kind: 'file', path: 'card.md' }], 'Move card')

        await vi.advanceTimersByTimeAsync(200)
        expect(commit).not.toHaveBeenCalled()

        batcher.schedule('main', [{ content: 'moved and linked', kind: 'file', path: 'card.md' }], 'Link activity')
        resumeAutomaticFlush()
        await batcher.flush()

        expect(commit.mock.calls[0][0].files).toEqual([{ content: 'moved and linked', path: 'card.md' }])
        vi.useRealTimers()
    })

    it('acknowledges a captured document revision only after physical persistence succeeds', async () => {
        const acknowledge = vi.fn()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        const saveReference = { acknowledge, document: {} } as never
        batcher.schedule('main', [{ content: 'saved', kind: 'file', path: 'card.md', saveReference }], 'Update card')

        await batcher.flush()

        expect(acknowledge).toHaveBeenCalledOnce()
    })

    it('acknowledges local persistence before waiting for post-commit work', async () => {
        const postCommit = createDeferred<void>()
        const acknowledge = vi.fn()
        const afterCommit = vi.fn(async () => postCommit.promise)
        const batcher = createBatcher(vi.fn<CommitCallback>(async () => undefined), afterCommit)
        const saveReference = { acknowledge, document: {} } as never
        batcher.schedule('main', [{ content: 'saved', kind: 'file', path: 'card.md', saveReference }], 'Update card')

        const flush = batcher.flush()
        await vi.waitFor(() => expect(afterCommit).toHaveBeenCalledOnce())

        expect(acknowledge).toHaveBeenCalledOnce()
        expect(batcher.hasPendingFile('card.md')).toBe(false)

        postCommit.resolve()
        await flush
    })

    it('keeps a locally persisted revision acknowledged when post-commit work fails', async () => {
        const acknowledge = vi.fn()
        const pushFailure = new Error('push failed')
        const push = vi.fn(async () => { throw pushFailure })
        const batcher = createBatcher(vi.fn<CommitCallback>(async () => undefined), push)
        const saveReference = { acknowledge, document: {} } as never
        batcher.schedule('main', [{ content: 'saved', kind: 'file', path: 'card.md', saveReference }], 'Update card')

        await expect(batcher.flush()).rejects.toBe(pushFailure)

        expect(acknowledge).toHaveBeenCalledOnce()
        expect(batcher.hasPendingFile('card.md')).toBe(false)
    })

    it('does not acknowledge a document revision when physical persistence fails', async () => {
        const acknowledge = vi.fn()
        const failure = new Error('commit failed')
        const commit = vi.fn<CommitCallback>(async () => { throw failure })
        const batcher = createBatcher(commit)
        const saveReference = { acknowledge, document: {} } as never
        batcher.schedule('main', [{ content: 'unsaved', kind: 'file', path: 'card.md', saveReference }], 'Update card')

        await expect(batcher.flush()).rejects.toBe(failure)

        expect(acknowledge).not.toHaveBeenCalled()
        expect(batcher.hasPendingFile('card.md')).toBe(true)
    })

    it('batches typing commits until the delay expires', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const onPendingChange = vi.fn()
        const batcher = createBatcher(commit)
        batcher.addEventListener(COMMIT_BATCHER_PENDING_CHANGED_EVENT, onPendingChange)

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')
        batcher.schedule('main', [{ content: 'two', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')

        expect(commit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }], message: 'Update root' })
        expect(onPendingChange).toHaveBeenCalledTimes(4)
        vi.useRealTimers()
    })

    it('resets the delay on each new change so continuous edits commit as one batch', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')
        await vi.advanceTimersByTimeAsync(20000)
        batcher.schedule('main', [{ content: 'two', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')
        await vi.advanceTimersByTimeAsync(20000)

        expect(commit).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(10000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }] })
        vi.useRealTimers()
    })

    it('flushes one logical change with the exact message on close', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')
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
        const batcher = createBatcher(commit)
        batcher.addEventListener(COMMIT_BATCHER_FLUSH_FAILED_EVENT, (event) => {
            onFlushError((event as CustomEvent<unknown>).detail)
        })

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update root')
        await vi.advanceTimersByTimeAsync(30000)

        expect(onFlushError).toHaveBeenCalledWith(error)
        expect(batcher.hasPending()).toBe(true)

        commit.mockImplementation(async () => undefined)
        await batcher.flush()

        expect(batcher.hasPending()).toBe(false)
        expect(commit).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
    })

    it('combines distinct messages for a multi-file batch', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', kind: 'file', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
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
        const batcher = createBatcher(commit)

        batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', kind: 'file', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'three', kind: 'file', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
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
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{ actionId: 'review', content: 'old', kind: 'action', path: 'actions/review.json', sourcePath: 'actions/review.json' }], 'Update action')

        const pendingFlush = batcher.flush()
        batcher.schedule('main', [{ actionId: 'review', content: 'new', kind: 'action', path: 'actions/review.json', sourcePath: 'actions/review.json' }], 'Update action')
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
        const batcher = createBatcher(commit)

        batcher.schedule('main', [{
            actionId: 'review',
            content: 'first',
            kind: 'action',
            path: 'actions/review-c.json',
            sourcePath: 'actions/new-action.json',
            onPathCommitted: onCommitted,
        }], 'Rename action')
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'latest',
            kind: 'action',
            path: 'actions/review-code.json',
            sourcePath: 'actions/new-action.json',
            onPathCommitted: onCommitted,
        }], 'Rename action')
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

    it('retargets an uncommitted creation as a recoverable move', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const onCommitted = vi.fn()
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'initial',
            kind: 'action',
            path: 'actions/new-action.json',
            sourcePath: 'actions/new-action.json',
        }], 'Create action')

        batcher.schedule('main', [{
            actionId: 'review',
            content: 'latest',
            kind: 'action',
            onPathCommitted: onCommitted,
            path: 'actions/review-code.json',
            sourcePath: 'actions/new-action.json',
        }], 'Rename action')
        await batcher.flush()

        expect(commit.mock.calls[0][0]).toEqual({
            branch: 'main',
            files: [],
            message: 'Update 1 files\n\n- Create action\n- Rename action',
            moves: [{
                content: 'latest',
                fromPath: 'actions/new-action.json',
                toPath: 'actions/review-code.json',
            }],
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
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'first',
            kind: 'action',
            onPathCommitted: firstCommitted,
            path: 'actions/review.json',
            sourcePath: 'actions/new-action.json',
        }], 'Rename action')

        const pendingFlush = batcher.flush()
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'latest',
            kind: 'action',
            onPathCommitted: secondCommitted,
            path: 'actions/review-code.json',
            sourcePath: 'actions/new-action.json',
        }], 'Rename action')
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

    it('keeps a newer identity change when the active batch fails', async () => {
        const firstCommit = createDeferred<void>()
        const failure = new Error('commit failed')
        const commit = vi.fn<CommitCallback>()
            .mockImplementationOnce(async () => firstCommit.promise)
            .mockImplementationOnce(async () => undefined)
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'old',
            kind: 'action',
            path: 'actions/review.json',
            sourcePath: 'actions/review.json',
        }], 'Update action')

        const pendingFlush = batcher.flush()
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'new',
            kind: 'action',
            path: 'actions/review.json',
            sourcePath: 'actions/review.json',
        }], 'Update action')
        firstCommit.reject(failure)
        await expect(pendingFlush).rejects.toBe(failure)

        await batcher.flush()

        expect(commit.mock.calls[1][0].files).toEqual([{ content: 'new', path: 'actions/review.json' }])
    })

    it('separates card, action, and generic file keys even when identity text and paths collide', async () => {
        const card = { header: { status: 'ready' }, path: 'shared' } as Card
        const serializeCard = vi.spyOn(markdownParsingService, 'serializeCard').mockReturnValue({ content: 'card', path: 'shared' })
        const acknowledgeCard = vi.spyOn(markdownParsingService, 'acknowledgeSerializedCard').mockImplementation(() => undefined)
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit, undefined, undefined, () => card)

        batcher.schedule('main', [
            { cardInternalId: 'shared', kind: 'card', path: 'shared' },
            { actionId: 'shared', content: 'action', kind: 'action', path: 'shared', sourcePath: 'shared' },
            { content: 'file', kind: 'file', path: 'shared' },
        ], 'Update shared identities')
        await batcher.flush()

        expect(commit.mock.calls[0][0].files).toEqual([
            { content: 'card', path: 'shared' },
            { content: 'action', path: 'shared' },
            { content: 'file', path: 'shared' },
        ])
        serializeCard.mockRestore()
        acknowledgeCard.mockRestore()
    })

    it('discards a pending file without committing it', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{ content: 'draft', kind: 'file', path: 'actions/review.json' }], 'Update action')

        batcher.discardPendingFile('actions/review.json')
        await vi.advanceTimersByTimeAsync(30000)

        expect(batcher.hasPendingFile('actions/review.json')).toBe(false)
        expect(commit).not.toHaveBeenCalled()
        vi.useRealTimers()
    })

    it('discards one queued action by ID and keeps unrelated changes queued', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        batcher.schedule('main', [
            { actionId: 'deleted', content: 'new', kind: 'action', path: 'actions/new.json', sourcePath: 'actions/new.json' },
            { content: 'other', kind: 'file', path: 'other.md' },
        ], 'Save files')

        batcher.discardPendingAction('deleted')

        expect(batcher.hasPendingAction('deleted')).toBe(false)
        expect(batcher.hasPendingFile('other.md')).toBe(true)
        await batcher.flush()
        expect(commit.mock.calls[0][0].files).toEqual([{ content: 'other', path: 'other.md' }])
    })

    describe('writePending', () => {
        it('writes pending files and moves without a message and keeps them pending', async () => {
            const commit = vi.fn<CommitCallback>(async () => undefined)
            const writeFiles = vi.fn<WriteCallback>(async () => undefined)
            const acknowledge = vi.fn()
            const onPersisted = vi.fn()
            const onPathCommitted = vi.fn()
            const saveReference = { acknowledge, document: {} } as never
            const batcher = createBatcher(commit, undefined, undefined, undefined, writeFiles)
            batcher.schedule('main', [{ content: 'new card', kind: 'file', onPersisted, path: 'design/F-1.md', saveReference }], 'Create card')
            batcher.schedule('main', [{
                actionId: 'review',
                content: 'action',
                kind: 'action',
                onPathCommitted,
                path: 'actions/review.json',
                sourcePath: 'actions/new-action.json',
            }], 'Rename action')

            await batcher.writePending()

            expect(writeFiles).toHaveBeenCalledOnce()
            expect(writeFiles.mock.calls[0][0]).toEqual({
                branch: 'main',
                files: [{ content: 'new card', path: 'design/F-1.md' }],
                moves: [{ content: 'action', fromPath: 'actions/new-action.json', toPath: 'actions/review.json' }],
            })
            expect(commit).not.toHaveBeenCalled()
            expect(batcher.hasPendingFile('design/F-1.md')).toBe(true)
            expect(batcher.hasPendingAction('review')).toBe(true)
            expect(acknowledge).not.toHaveBeenCalled()
            expect(onPersisted).not.toHaveBeenCalled()
            expect(onPathCommitted).not.toHaveBeenCalled()
        })

        it('does nothing when nothing is pending', async () => {
            const writeFiles = vi.fn<WriteCallback>(async () => undefined)
            const batcher = createBatcher(vi.fn<CommitCallback>(async () => undefined), undefined, undefined, undefined, writeFiles)

            await batcher.writePending()

            expect(writeFiles).not.toHaveBeenCalled()
        })

        it('does not reset the timed commit', async () => {
            vi.useFakeTimers()
            const commit = vi.fn<CommitCallback>(async () => undefined)
            const batcher = createBatcher(commit)
            batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'card.md' }], 'Update card')
            await vi.advanceTimersByTimeAsync(20000)

            await batcher.writePending()
            await vi.advanceTimersByTimeAsync(10000)

            expect(commit).toHaveBeenCalledOnce()
            expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'one', path: 'card.md' }], message: 'Update card' })
            vi.useRealTimers()
        })

        it('keeps the batch pending and rethrows when the write fails', async () => {
            const failure = new Error('disk unavailable')
            const writeFiles = vi.fn<WriteCallback>(async () => { throw failure })
            const batcher = createBatcher(vi.fn<CommitCallback>(async () => undefined), undefined, undefined, undefined, writeFiles)
            batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'card.md' }], 'Update card')

            await expect(batcher.writePending()).rejects.toBe(failure)

            expect(batcher.hasPendingFile('card.md')).toBe(true)
        })

        it('waits for an in-flight commit before writing', async () => {
            const pendingCommit = createDeferred<void>()
            const commit = vi.fn<CommitCallback>(async () => pendingCommit.promise)
            const writeFiles = vi.fn<WriteCallback>(async () => undefined)
            const batcher = createBatcher(commit, undefined, undefined, undefined, writeFiles)
            batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'card.md' }], 'Update card')
            const flush = batcher.flush()
            batcher.schedule('main', [{ content: 'two', kind: 'file', path: 'card.md' }], 'Update card')

            const write = batcher.writePending()
            await Promise.resolve()
            expect(writeFiles).not.toHaveBeenCalled()

            pendingCommit.resolve()
            await flush
            await write
            expect(writeFiles.mock.calls[0][0]).toEqual({ branch: 'main', files: [{ content: 'two', path: 'card.md' }] })
        })

        it('makes flush wait for an in-flight write', async () => {
            const pendingWrite = createDeferred<void>()
            const commit = vi.fn<CommitCallback>(async () => undefined)
            const writeFiles = vi.fn<WriteCallback>(async () => pendingWrite.promise)
            const batcher = createBatcher(commit, undefined, undefined, undefined, writeFiles)
            batcher.schedule('main', [{ content: 'one', kind: 'file', path: 'card.md' }], 'Update card')
            const write = batcher.writePending()
            await vi.waitFor(() => expect(writeFiles).toHaveBeenCalledOnce())

            const flush = batcher.flush()
            await Promise.resolve()
            expect(commit).not.toHaveBeenCalled()

            pendingWrite.resolve()
            await write
            await flush
            expect(commit).toHaveBeenCalledOnce()
        })
    })

    it('describes each queued change with kind, target path and messages', () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = createBatcher(commit)
        batcher.schedule('main', [{ content: 'first', kind: 'file', path: 'notes.md' }], 'Update notes.md')
        batcher.schedule('main', [{ content: 'second', kind: 'file', path: 'notes.md' }], 'Retitle notes.md')
        batcher.schedule('main', [{
            actionId: 'review',
            content: 'action',
            kind: 'action',
            path: 'actions/review-code.json',
            sourcePath: 'actions/review.json',
        }], 'Rename action')

        expect(batcher.describePendingChanges()).toEqual([
            'file notes.md (Update notes.md; Retitle notes.md)',
            'action actions/review-code.json (Rename action)',
        ])
    })
})
