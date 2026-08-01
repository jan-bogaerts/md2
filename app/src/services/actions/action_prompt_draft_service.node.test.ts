import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
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
        beginActionPromptDraft: vi.fn(async () => 2),
        sendActionQueuedMessage: vi.fn(async () => ({ sent: true })),
        setActionQueuedMessage: vi.fn(async () => ({ accepted: true })),
        ...overrides,
    } as unknown as ElectronActionBridge
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

    it('serializes remote writes with increasing revisions', async () => {
        const setActionQueuedMessage = vi.fn(async () => ({ accepted: true }))
        setActionBridgeOverride(createRemoteBridge({ setActionQueuedMessage }))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })

        draft.edit('First')
        const firstWrite = draft.synchronize()
        draft.edit('Second')
        const secondWrite = draft.synchronize()
        await Promise.all([firstWrite, secondWrite])

        expect(setActionQueuedMessage).toHaveBeenNthCalledWith(1, 'run-1', 2, 'First', 1)
        expect(setActionQueuedMessage).toHaveBeenNthCalledWith(2, 'run-1', 2, 'Second', 2)
    })

    it('retains draft when remote send acknowledgement fails', async () => {
        setActionBridgeOverride(createRemoteBridge({
            sendActionQueuedMessage: vi.fn(async () => {
                throw new Error('Queued agent message session expired')
            }),
        }))
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })
        draft.edit('Do not lose this')
        await draft.synchronize()

        await expect(draft.send()).rejects.toThrow('session expired')
        expect(draft.getSnapshot()).toBe('Do not lose this')
    })

    it('clears every subscriber after successful send', async () => {
        setActionBridgeOverride(createRemoteBridge())
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, run, { prepare: false })
        const listener = vi.fn()
        draft.subscribe(listener)
        draft.edit('Send this')

        await draft.send()

        expect(draft.getSnapshot()).toBe('')
        expect(listener).toHaveBeenCalledTimes(2)
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
})
