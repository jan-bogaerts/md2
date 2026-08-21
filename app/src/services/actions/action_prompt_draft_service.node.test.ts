import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { ActionQueuedPrompt } from '../../data/action_run_types'
import { RemoteControlConnectionError } from '../data/remote_control_storage_service'
import { ActionPromptDraftService, type ActionPromptRunBinding } from './action_prompt_draft_service'

const context = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }
const run: ActionPromptRunBinding = {
    activeActionId: 'review',
    activeActionType: 'agent',
    runId: 'run-1',
    interactionReady: true,
    rootActionId: 'review',
}

function createRemoteBridge(overrides: Partial<ElectronActionBridge> = {}) {
    return {
        enqueueActionPrompt: vi.fn(async (_runId, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0})),
        ...overrides,
    } as unknown as ElectronActionBridge
}

function deferred<T>() {
    let resolvePromise: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => { resolvePromise = resolve })

    return { promise, resolve: resolvePromise }
}

afterEach(() => setActionBridgeOverride(null))

describe('ActionPromptDraftService', () => {
    it('keeps stable identity by action context and active agent session', () => {
        const service = new ActionPromptDraftService()
        const options = { initialValue: 'Plan', prepare: false }
        const idle = service.getDraft('review', context, null, options)

        expect(service.getDraft('review', { ...context, state: 'done' }, null, options)).toBe(idle)
        expect(service.getDraft('other', context, null, options)).not.toBe(idle)

        const active = service.getDraft('review', context, run, options)
        expect(service.getDraft('review', context, { ...run, interactionReady: false }, options)).toBe(active)
        expect(active).not.toBe(idle)
    })

    it('publishes local edits only to value subscribers', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        const valueListener = vi.fn()
        const editorListener = vi.fn()
        draft.subscribe(valueListener)
        draft.subscribeEditor(editorListener)

        draft.edit('Plan')
        draft.edit('Plan')

        expect(draft.getSnapshot()).toBe('Plan')
        expect(valueListener).toHaveBeenCalledOnce()
        expect(editorListener).not.toHaveBeenCalled()
    })

    it('replaces and clears mounted editor content exactly once per operation', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        const editorListener = vi.fn()
        draft.subscribeEditor(editorListener)

        draft.replace('Prepared')
        draft.clear()

        expect(editorListener).toHaveBeenCalledTimes(2)
        expect(draft.getEditorSnapshot().replacementRevision).toBe(2)
        expect(draft.getSnapshot()).toBe('')
    })

    it('does not replace a newer local edit with superseded preparation', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        let resolvePreparation: (value: string) => void = () => undefined
        const preparation = draft.prepare(() => new Promise((resolve) => {
            resolvePreparation = resolve
        }))

        draft.edit('User draft')
        resolvePreparation('Prepared draft')
        await preparation

        expect(draft.getSnapshot()).toBe('User draft')
        expect(draft.getEditorSnapshot().preparationStatus).toBe('ready')
    })

    it('keeps connection-loss preparation loading and retries after readiness returns', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })

        await draft.prepare(async () => {
            throw new RemoteControlConnectionError('connection closed')
        })
        expect(draft.getEditorSnapshot().preparationStatus).toBe('loading')

        await draft.prepare(async () => 'Prepared after reconnect')
        expect(draft.getSnapshot()).toBe('Prepared after reconnect')
        expect(draft.getEditorSnapshot().preparationStatus).toBe('ready')
    })

    it('does not retry connection-loss preparation after user edits', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        await draft.prepare(async () => {
            throw new RemoteControlConnectionError('connection closed')
        })
        draft.edit('User draft')
        const prepare = vi.fn(async () => 'Prepared after reconnect')

        await draft.prepare(prepare)

        expect(prepare).not.toHaveBeenCalled()
        expect(draft.getSnapshot()).toBe('User draft')
    })

    it('keeps editor changes local until explicit send', () => {
        const enqueueActionPrompt = vi.fn()
        setActionBridgeOverride(createRemoteBridge({ enqueueActionPrompt }))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })

        draft.edit('First')
        draft.edit('Second')

        expect(enqueueActionPrompt).not.toHaveBeenCalled()
        expect(draft.getSnapshot()).toBe('Second')
    })

    it('retains draft when enqueue fails', async () => {
        setActionBridgeOverride(createRemoteBridge({
            enqueueActionPrompt: vi.fn(async () => {
                throw new Error('Queue unavailable')
            }),
        }))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })
        draft.edit('Do not lose this')

        await expect(draft.send()).rejects.toThrow('Queue unavailable')
        expect(draft.getSnapshot()).toBe('Do not lose this')
    })

    it('clears every subscriber after successful send', async () => {
        const enqueueActionPrompt = vi.fn(async (_runId, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0}))
        setActionBridgeOverride(createRemoteBridge({ enqueueActionPrompt }))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })
        const listener = vi.fn()
        draft.subscribe(listener)
        draft.edit('Send this')

        await draft.send()

        expect(enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Send this')
        expect(draft.getSnapshot()).toBe('')
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('does not clear text edited while enqueue acknowledgement is pending', async () => {
        const acceptance = deferred<ActionQueuedPrompt>()
        setActionBridgeOverride(createRemoteBridge({enqueueActionPrompt: vi.fn(() => acceptance.promise)}))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })
        draft.edit('Accepted text')

        const send = draft.send()
        draft.edit('New editor text')
        acceptance.resolve({ content: 'Accepted text', dispatchState: 'queued', id: 'prompt-1', revision: 0 })
        await send

        expect(draft.getSnapshot()).toBe('New editor text')
    })

    it('cleans drafts only through explicit lifecycle operations', () => {
        const service = new ActionPromptDraftService()
        const first = service.getDraft('review', context, null, { prepare: false })
        first.edit('Keep')

        expect(service.getDraft('review', context, null, { prepare: false })).toBe(first)

        service.clearAction('review')
        const replacement = service.getDraft('review', context, null, { prepare: false })
        expect(first.getSnapshot()).toBe('')
        expect(replacement).not.toBe(first)

        replacement.edit('Project draft')
        service.clearAll()
        expect(replacement.getSnapshot()).toBe('')
    })

    it('invalidates idle prepared defaults without discarding user or active-run drafts', async () => {
        const service = new ActionPromptDraftService()
        const prepared = service.getDraft('review', context, null, { prepare: true })
        await prepared.prepare(async () => 'Prepared prompt')
        const editedContext = { ...context, cardInternalId: 'card-2' }
        const edited = service.getDraft('review', editedContext, null, { prepare: true })
        edited.edit('User prompt')
        const active = service.getDraft('review', context, run, { prepare: false })
        active.edit('Active prompt')

        service.invalidateIdlePreparedDrafts('review')

        const replacement = service.getDraft('review', context, null, { prepare: true })
        expect(replacement).not.toBe(prepared)
        expect(prepared.getSnapshot()).toBe('Prepared prompt')
        expect(service.getDraft('review', editedContext, null, { prepare: true })).toBe(edited)
        expect(service.getDraft('review', context, run, { prepare: false })).toBe(active)
    })
})
