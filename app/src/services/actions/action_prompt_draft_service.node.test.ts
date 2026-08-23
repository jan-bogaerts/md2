import { describe, expect, it, vi } from 'vitest'
import { RemoteControlConnectionError } from '../data/remote_control_storage_service'
import { ActionPromptDraftService } from './action_prompt_draft_service'

const context = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }

describe('ActionPromptDraftService', () => {
    it('keeps one draft per action and context identity across a whole run', () => {
        const service = new ActionPromptDraftService()
        const options = { initialValue: 'Plan', prepare: false }
        const draft = service.getDraft('review', context, options)

        expect(service.getDraft('review', { ...context, state: 'done' }, options)).toBe(draft)
        expect(service.getDraft('other', context, options)).not.toBe(draft)
        expect(service.getDraft('review', { ...context, cardInternalId: 'card-2' }, options)).not.toBe(draft)
    })

    it('publishes local edits only to value subscribers', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, { prepare: false })
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
        const draft = service.getDraft('review', context, { prepare: false })
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
        const draft = service.getDraft('review', context, { prepare: true })
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
        const draft = service.getDraft('review', context, { prepare: true })

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
        const draft = service.getDraft('review', context, { prepare: true })
        await draft.prepare(async () => {
            throw new RemoteControlConnectionError('connection closed')
        })
        draft.edit('User draft')
        const prepare = vi.fn(async () => 'Prepared after reconnect')

        await draft.prepare(prepare)

        expect(prepare).not.toHaveBeenCalled()
        expect(draft.getSnapshot()).toBe('User draft')
    })

    it('exposes no delivery API', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, { prepare: false }) as unknown as Record<string, unknown>

        expect(draft.send).toBeUndefined()
        expect(draft.bindRun).toBeUndefined()
    })

    it('tracks a revision that only advances when the value is set', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, { prepare: false })
        const initialRevision = draft.getRevision()

        draft.edit('Typed')

        expect(draft.getRevision()).toBe(initialRevision + 1)
    })

    it('empties a cleared draft without replacing the object bound to the editor', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, { prepare: false })
        draft.edit('Sent request')

        service.clearDraft('review', context)

        expect(draft.getSnapshot()).toBe('')
        expect(service.getDraft('review', context, { prepare: false })).toBe(draft)
    })

    it('discards an unedited prepared default and keeps user-edited text', async () => {
        const service = new ActionPromptDraftService()
        const prepared = service.getDraft('review', context, { prepare: true })
        await prepared.prepare(async () => 'Prepared prompt')

        service.discardUneditedDraft('review', context)
        expect(prepared.getSnapshot()).toBe('')

        prepared.edit('Typed while the agent was finishing')
        service.discardUneditedDraft('review', context)

        expect(prepared.getSnapshot()).toBe('Typed while the agent was finishing')
        expect(service.getDraft('review', context, { prepare: false })).toBe(prepared)
    })

    it('flushes the mounted editor before judging a draft as unedited', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, { prepare: false })
        draft.markdownDraft.addEventListener('flushRequested', () => draft.edit('Buffered keystrokes'))

        service.discardUneditedDraft('review', context)

        expect(draft.getSnapshot()).toBe('Buffered keystrokes')
    })

    it('cleans drafts only through explicit lifecycle operations', () => {
        const service = new ActionPromptDraftService()
        const first = service.getDraft('review', context, { prepare: false })
        first.edit('Keep')

        expect(service.getDraft('review', context, { prepare: false })).toBe(first)

        service.clearAction('review')
        const replacement = service.getDraft('review', context, { prepare: false })
        expect(first.getSnapshot()).toBe('')
        expect(replacement).not.toBe(first)

        replacement.edit('Project draft')
        service.clearAll()
        expect(replacement.getSnapshot()).toBe('')
    })

    it('invalidates prepared defaults without discarding user drafts', async () => {
        const service = new ActionPromptDraftService()
        const prepared = service.getDraft('review', context, { prepare: true })
        await prepared.prepare(async () => 'Prepared prompt')
        const editedContext = { ...context, cardInternalId: 'card-2' }
        const edited = service.getDraft('review', editedContext, { prepare: true })
        edited.edit('User prompt')

        service.invalidateIdlePreparedDrafts('review')

        const replacement = service.getDraft('review', context, { prepare: true })
        expect(replacement).not.toBe(prepared)
        expect(prepared.getSnapshot()).toBe('Prepared prompt')
        expect(service.getDraft('review', editedContext, { prepare: true })).toBe(edited)
    })
})
