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

    it('derives emptiness from current canonical text across edits, replacements, and preparation', async () => {
        const service = new ActionPromptDraftService();
        const draft = service.getDraft('review', context, null, { prepare: true });
        expect(draft.getEmptySnapshot()).toBe(true);
        await draft.prepare(async () => ({ prompt: 'Prepared' }));
        expect(draft.getEmptySnapshot()).toBe(false);
        draft.edit('New text');
        expect(draft.getEmptySnapshot()).toBe(false);
        expect(draft.getSnapshot()).toBe('New text');
        draft.edit(' \n\t');
        expect(draft.getEmptySnapshot()).toBe(true);
        draft.replace('External');
        expect(draft.getEmptySnapshot()).toBe(false);
        draft.clearForSend();
        expect(draft.getEmptySnapshot()).toBe(true);
    });

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

        draft.clearForSend()

        expect(draft.getSnapshot()).toBe('')
        expect(service.getDraft('review', context, null, { prepare: false })).toBe(draft)
    })

    it('keeps the draft across a new run and separates it from other conversations', () => {
        const service = new ActionPromptDraftService()
        const newConversationDraft = service.getDraft('review', context, null, { prepare: false })
        newConversationDraft.edit('First message')
        newConversationDraft.clearForSend()
        newConversationDraft.edit('Next message')

        service.attachNewConversation('review', context, 'conversation-1')

        expect(service.getDraft('review', context, 'conversation-1', { prepare: false })).toBe(newConversationDraft)
        expect(newConversationDraft.getSnapshot()).toBe('Next message')
        expect(service.getDraft('review', context, null, { prepare: false })).not.toBe(newConversationDraft)
        expect(service.getDraft('review', context, 'conversation-2', { prepare: false })).not.toBe(newConversationDraft)
    })

    it('uses card identity across card and file entry points', () => {
        const service = new ActionPromptDraftService()
        const cardContext = { cardInternalId: 'card-1', file: 'old.md', kind: 'card' as const }
        const fileContext = { cardInternalId: 'card-1', file: 'renamed.md', kind: 'file' as const }
        const draft = service.getDraft('review', cardContext, 'conversation-1', { prepare: false })

        expect(service.getDraft('review', fileContext, 'conversation-1', { prepare: false })).toBe(draft)
    })

    it('keeps an intentionally emptied prepared prompt empty', async () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: true })
        await draft.prepare(async () => ({ prompt: 'Prepared prompt' }))
        draft.edit('')

        await draft.prepare(async () => ({ prompt: 'Restored prompt' }))

        expect(draft.getSnapshot()).toBe('')
        expect(draft.hasLocalEdits()).toBe(true)
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

    it('keeps an intentionally emptied draft when popup housekeeping runs', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        draft.edit('Typed')
        draft.edit('')

        service.deleteEmptyDrafts()

        expect(service.getDraft('review', context, null, { prepare: false })).toBe(draft)
    })

    it('flushes mounted editors without clearing their drafts', () => {
        const service = new ActionPromptDraftService()
        const draft = service.getDraft('review', context, null, { prepare: false })
        draft.markdownDraft.addEventListener('flushRequested', () => draft.edit('Buffered keystrokes'))

        service.flushContextDrafts('review', context)

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
