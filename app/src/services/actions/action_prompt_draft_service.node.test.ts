import { describe, expect, it, vi } from 'vitest'
import { RemoteControlConnectionError } from '../data/remote_control_storage_service'
import { ActionPromptDraftService } from './action_prompt_draft_service'

const context = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }

describe('ActionPromptDraftService', () => {
    it('keeps reviewed change sets in separate prompt drafts for one diagram', () => {
        const service = new ActionPromptDraftService()
        const firstContext = {
            diagramChanges: 'First review', diagramChangeSetId: 'review-1', diagramId: 'diagram-1',
            kind: 'diagram' as const, type: 'root',
        }
        const secondContext = {
            diagramChanges: 'Second review', diagramChangeSetId: 'review-2', diagramId: 'diagram-1',
            kind: 'diagram' as const, type: 'root',
        }

        const first = service.getDraft('implement', firstContext, null, { prepare: true })
        const second = service.getDraft('implement', secondContext, null, { prepare: true })

        expect(second).not.toBe(first)
    })

    it('uses reviewed change-set identity instead of mutable prompt text', () => {
        const service = new ActionPromptDraftService()
        const firstContext = {
            diagramChanges: 'First text', diagramChangeSetId: 'review-1', diagramId: 'diagram-1',
            kind: 'diagram' as const, type: 'root',
        }
        const secondContext = { ...firstContext, diagramChanges: 'Changed transport text' }

        expect(service.getDraft('implement', secondContext, null, { prepare: true }))
            .toBe(service.getDraft('implement', firstContext, null, { prepare: true }))
    })

    it('keeps one draft per action and context identity across a whole run', () => {
        const service = new ActionPromptDraftService()
        const options = { initialValue: 'Plan', prepare: false }
        const draft = service.getDraft('review', context, null, options)

        expect(service.getDraft('review', { ...context, state: 'done' }, null, options)).toBe(draft)
        expect(service.getDraft('other', context, null, options)).not.toBe(draft)
        expect(service.getDraft('review', { ...context, cardInternalId: 'card-2' }, null, options)).not.toBe(draft)
    })

    it('keeps concurrent run drafts separate from each other and New conversation', () => {
        const service = new ActionPromptDraftService()
        const first = service.getDraft('review', context, 'run-1', { prepare: false })
        const second = service.getDraft('review', context, 'run-2', { prepare: false })
        const fresh = service.getDraft('review', context, null, { prepare: false })

        first.edit('First')
        second.edit('Second')
        fresh.edit('New')

        expect([first.getSnapshot(), second.getSnapshot(), fresh.getSnapshot()]).toEqual(['First', 'Second', 'New'])
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
        let resolvePreparation: (value: { prompt: string }) => void = () => undefined
        const preparation = draft.prepare(() => new Promise<{ prompt: string }>((resolve) => {
            resolvePreparation = resolve
        }))

        draft.edit('User draft')
        resolvePreparation({ prompt: 'Prepared draft' })
        await preparation

        expect(draft.getSnapshot()).toBe('User draft')
        expect(draft.getEditorSnapshot().preparationStatus).toBe('ready')
    })

    it('ignores editor synchronization while prompt preparation is loading', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        let resolvePreparation: (value: { prompt: string }) => void = () => undefined
        const preparation = draft.prepare(() => new Promise<{ prompt: string }>((resolve) => {
            resolvePreparation = resolve
        }))

        draft.editorDraft.edit('Previous action prompt')
        resolvePreparation({ prompt: 'Prepared draft' })
        await preparation

        expect(draft.getSnapshot()).toBe('Prepared draft')
        expect(draft.hasLocalEdits()).toBe(false)
    })

    it('keeps connection-loss preparation loading and retries after readiness returns', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })

        await draft.prepare(async () => {
            throw new RemoteControlConnectionError('connection closed')
        })
        expect(draft.getEditorSnapshot().preparationStatus).toBe('loading')

        await draft.prepare(async () => ({ prompt: 'Prepared after reconnect' }))
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
        const prepare = vi.fn(async () => ({ prompt: 'Prepared after reconnect' }))

        await draft.prepare(prepare)

        expect(prepare).not.toHaveBeenCalled()
        expect(draft.getSnapshot()).toBe('User draft')
    })

    it('exposes no delivery API', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false }) as unknown as Record<string, unknown>

        expect(draft.send).toBeUndefined()
        expect(draft.bindRun).toBeUndefined()
    })

    it('tracks a revision that only advances when the value is set', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        const initialRevision = draft.getRevision()

        draft.edit('Typed')

        expect(draft.getRevision()).toBe(initialRevision + 1)
    })

    it('retains prepared diagram path through local prompt edits and clears it with draft', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('diagram', { kind: 'diagram', type: 'root' }, null, { prepare: true })
        await draft.prepare(async () => ({ diagramPath: 'design/diagrams/overview.json', prompt: 'Create overview' }))

        draft.edit('Create detailed overview')
        expect(draft.getDiagramPath()).toBe('design/diagrams/overview.json')

        draft.clear()
        expect(draft.getDiagramPath()).toBeNull()
    })

    it('empties a cleared draft without replacing the object bound to the editor', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        draft.edit('Sent request')

        service.clearDraft('review', context, null)

        expect(draft.getSnapshot()).toBe('')
        expect(service.getDraft('review', context, null, { prepare: false })).toBe(draft)
    })

    it('deletes only unedited drafts during terminal cleanup', () => {
        const service = new ActionPromptDraftService()
        const unedited = service.getDraft('review', context, 'run-1', { prepare: false })
        const edited = service.getDraft('review', context, 'run-2', { prepare: false })
        edited.edit('Keep this text')

        service.deleteUneditedDraft('review', context, 'run-1')
        service.deleteUneditedDraft('review', context, 'run-2')

        expect(service.getDraft('review', context, 'run-1', { prepare: false })).not.toBe(unedited)
        expect(service.getDraft('review', context, 'run-2', { prepare: false })).toBe(edited)
    })

    it('discards an unedited prepared default and keeps user-edited text', async () => {
        const service = new ActionPromptDraftService()
        const prepared = service.getDraft('review', context, null, { prepare: true })
        await prepared.prepare(async () => ({ prompt: 'Prepared prompt' }))

        service.discardUneditedDraft('review', context, null)
        expect(prepared.getSnapshot()).toBe('')

        prepared.edit('Typed while the agent was finishing')
        service.discardUneditedDraft('review', context, null)

        expect(prepared.getSnapshot()).toBe('Typed while the agent was finishing')
        expect(service.getDraft('review', context, null, { prepare: false })).toBe(prepared)
    })

    it('prepares again after an unedited prompt is cleared', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        await draft.prepare(async () => ({ prompt: 'First prepared prompt' }))
        service.discardUneditedDraft('review', context, null)

        await draft.prepare(async () => ({ prompt: 'Prepared again' }))

        expect(draft.getSnapshot()).toBe('Prepared again')
        expect(draft.hasLocalEdits()).toBe(false)
    })

    it('treats exact-empty local input as unedited and prepares it again', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        await draft.prepare(async () => ({ prompt: 'Prepared prompt' }))
        draft.edit('')

        await draft.prepare(async () => ({ prompt: 'Restored prompt' }))

        expect(draft.getSnapshot()).toBe('Restored prompt')
        expect(draft.hasLocalEdits()).toBe(false)
    })

    it('deletes exact-empty drafts while preserving non-empty user drafts', () => {
        const service = new ActionPromptDraftService()
        const empty = service.getDraft('review', context, null, { prepare: false })
        const preservedContext = { ...context, cardInternalId: 'card-2' }
        const preserved = service.getDraft('review', preservedContext, null, { prepare: false })
        preserved.edit('Keep')

        service.deleteEmptyDrafts()

        expect(service.getDraft('review', context, null, { prepare: false })).not.toBe(empty)
        expect(service.getDraft('review', preservedContext, null, { prepare: false })).toBe(preserved)
    })

    it('flushes the mounted editor before judging a draft as unedited', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        draft.markdownDraft.addEventListener('flushRequested', () => draft.edit('Buffered keystrokes'))

        service.discardUneditedDraft('review', context, null)

        expect(draft.getSnapshot()).toBe('Buffered keystrokes')
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

    it('invalidates prepared defaults without discarding user drafts', async () => {
        const service = new ActionPromptDraftService()
        const prepared = service.getDraft('review', context, null, { prepare: true })
        await prepared.prepare(async () => ({ prompt: 'Prepared prompt' }))
        const editedContext = { ...context, cardInternalId: 'card-2' }
        const edited = service.getDraft('review', editedContext, null, { prepare: true })
        edited.edit('User prompt')

        service.invalidateIdlePreparedDrafts('review')

        const replacement = service.getDraft('review', context, null, { prepare: true })
        expect(replacement).not.toBe(prepared)
        expect(prepared.getSnapshot()).toBe('Prepared prompt')
        expect(service.getDraft('review', editedContext, null, { prepare: true })).toBe(edited)
    })
})
