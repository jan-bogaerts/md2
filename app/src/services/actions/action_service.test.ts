import { describe, expect, it, vi } from 'vitest'
import { ActionService, editableActionDefinition, serializeActionDefinition } from './action_service'
import {
    CUSTOM_PROMPT_ACTION_ID,
    REMARKABLE_CONVERT_ACTION_ID,
    type ActionFile,
    type RawActionDefinition,
} from '../../data/action_types'

function file(definition: unknown): ActionFile {
    return fileAt('actions/action.json', definition)
}

function fileAt(path: string, definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path }
}

const VALID: RawActionDefinition = { command: 'run', description: 'Do it', id: 'action-do', label: 'Do', type: 'command' }

function deletionGateway() {
    return {
        discardPendingActionFile: vi.fn(),
        hasPendingActionFile: vi.fn(() => false),
        persistActionFile: vi.fn(async () => undefined),
    }
}

describe('ActionService', () => {
    it('exposes built-in actions before loading', () => {
        const service = new ActionService()

        expect(service.getActions().map((action) => action.id)).toEqual([CUSTOM_PROMPT_ACTION_ID, REMARKABLE_CONVERT_ACTION_ID])
    })

    it('loads project action files alongside the built-in and notifies listeners', () => {
        const service = new ActionService()
        let notified = 0
        service.addEventListener('changed', () => { notified += 1 })

        service.loadFromFiles([file(VALID)])

        expect(service.getActions().map((action) => action.id)).toContain('action-do')
        expect(service.getActions().map((action) => action.id)).toContain(CUSTOM_PROMPT_ACTION_ID)
        expect(notified).toBe(1)
    })

    it('keeps temporary editor state on the action object across reloads and saves', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (persistedFile: ActionFile) => { persistedFiles.push(persistedFile) })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        const editorState = {
            phrases: [{
                identity: 'phrase-00000000-0000-4000-8000-000000000001',
                phrase: { text: 'Transient text', title: 'Transient title' },
            }],
            selectedTab: 'prompt',
        }
        service.setActionEditorState('actions/action.json', editorState)
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(changed).toHaveBeenCalledTimes(1)

        service.reloadFromFiles(
            [file({ ...VALID, label: 'Reloaded' })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(changed).toHaveBeenCalledTimes(2)

        await service.saveDefinition('actions/action.json', { ...VALID, label: 'Saved' })
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(changed).toHaveBeenCalledTimes(3)
        expect(persistedFiles[0].content).not.toContain('editorState')
        expect(persistedFiles[0].content).not.toContain(editorState.phrases[0].identity)
    })

    it('keeps editor state with each owning action', () => {
        const service = new ActionService()
        service.loadFromFiles([
            file(VALID),
            fileAt('actions/other.json', { ...VALID, id: 'action-other', label: 'Other' }),
        ])
        const firstState = { phrases: [], selectedTab: 'prompt' }
        const otherState = { phrases: [], selectedTab: 'definition' }

        service.setActionEditorState('actions/action.json', firstState)
        service.setActionEditorState('actions/other.json', otherState)

        expect(service.getActionByPath('actions/action.json')?.editorState).toBe(firstState)
        expect(service.getActionByPath('actions/other.json')?.editorState).toBe(otherState)
    })

    it('discards editor state when loading another project', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])
        service.setActionEditorState('actions/action.json', { phrases: [], selectedTab: 'prompt' })

        service.loadFromFiles([file({ ...VALID, label: 'Other project' })])

        expect(service.getActionByPath('actions/action.json')?.editorState).toBeUndefined()
    })

    it('loads usable definitions and exposes errors from invalid files', () => {
        const service = new ActionService()
        const usable = { ...VALID, id: 'action-usable', label: 'Usable' }

        expect(() => service.loadFromFiles([file({ ...VALID, type: 'bad' }), file(usable)])).not.toThrow()
        expect(service.getActions().map((action) => action.id)).toContain('action-usable')
        expect(service.getState().error).toContain('Invalid action type')
    })

    it('replaces previous actions with usable reload results and exposes errors', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])
        const replacement = { ...VALID, id: 'action-replacement', label: 'Replacement' }

        service.reloadFromFiles(
            [file({ ...VALID, type: 'bad' }), file(replacement)],
            [{ origin: 'external', path: 'actions/action.json' }],
        )

        expect(service.getActions().map((action) => action.id)).toContain('action-replacement')
        expect(service.getActions().map((action) => action.id)).not.toContain('action-do')
        expect(service.getState().error).toContain('actions/action.json')
        expect(service.getState().error).toContain('Invalid action type')
    })

    it('finds matching onState actions for the current context', () => {
        const service = new ActionService()
        service.loadFromFiles([file({ ...VALID, appliesTo: { type: 'feature' }, onState: 'ready' })])

        const matches = service.getActionsForStateTrigger('ready', { file: 'design/F-010.md', kind: 'card', state: 'ready', type: 'feature' })

        expect(matches.map((action) => action.id)).toEqual(['action-do'])
    })

    it('clears back to the built-in action', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        service.clear()

        expect(service.getActions().map((action) => action.id)).toEqual([CUSTOM_PROMPT_ACTION_ID, REMARKABLE_CONVERT_ACTION_ID])
    })

    it('creates a valid agent definition with generated stable identity and path', () => {
        const service = new ActionService()
        const first = service.createDefinition('design/actions')

        expect(first.path).toBe('design/actions/new-action.json')
        expect(first.definition).toMatchObject({
            description: expect.any(String), id: expect.any(String), label: 'New action',
            prompt: expect.any(String), type: 'agent',
        })
        expect(service.validateDefinition(first.path, first.definition))
            .toEqual({ code: null, error: null, field: null, fieldPath: null, index: null, valid: true })
    })

    it('round-trips file-change tracking only when enabled', () => {
        const service = new ActionService()
        const tracked = {
            description: 'Track edits', id: 'agent-track', label: 'Track', prompt: 'Edit file',
            trackFileChanges: true, type: 'agent',
        } satisfies RawActionDefinition
        service.loadFromFiles([file(tracked)])
        const action = service.getActionByPath('actions/action.json')
        if (!action) throw new Error('Missing tracked action')

        expect(action.trackFileChanges).toBe(true)
        expect(editableActionDefinition(action).trackFileChanges).toBe(true)

        service.loadFromFiles([file({ ...tracked, trackFileChanges: undefined })])
        const untrackedAction = service.getActionByPath('actions/action.json')
        if (!untrackedAction) throw new Error('Missing untracked action')
        expect(untrackedAction.trackFileChanges).toBe(false)
        expect(editableActionDefinition(untrackedAction)).not.toHaveProperty('trackFileChanges')
    })

    it('routes validation failures by structured metadata, not message text', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        // Missing required field: routed to the exact field with a stable code.
        expect(service.validateDefinition('actions/action.json', { ...VALID, label: '' }))
            .toMatchObject({ code: 'missing-field', field: 'label', valid: false })

        // Duplicate id originating in another file: routed to `id`, never text-matched.
        service.loadFromFiles([file(VALID)])
        const other = { ...VALID, command: 'x', id: 'action-other' }
        expect(service.validateDefinition('actions/other.json', { ...other, id: VALID.id }))
            .toMatchObject({ code: 'duplicate-id', field: 'id', valid: false })

        // Unknown action id at a specific list index keeps the index.
        expect(service.validateDefinition('actions/action.json', { ...VALID, onBefore: [CUSTOM_PROMPT_ACTION_ID, 'missing'] }))
            .toMatchObject({ code: 'unknown-action', field: 'onBefore', index: 1, valid: false })

        // Circular reference and definition-level errors carry no field (general summary).
        expect(service.validateDefinition('actions/action.json', { ...VALID, onBefore: [VALID.id] }))
            .toMatchObject({ code: 'circular-reference', field: null, valid: false })
    })

    it('validates invalid drafts and undefined optionals without JSON round-tripping', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])
        const parse = vi.spyOn(JSON, 'parse')
        const stringify = vi.spyOn(JSON, 'stringify')

        service.updateDraft('actions/action.json', { ...VALID, icon: undefined, label: '' })

        expect(service.getDraft('actions/action.json').validation).toMatchObject({ field: 'label', valid: false })
        expect(parse).not.toHaveBeenCalled()
        expect(stringify).not.toHaveBeenCalled()
        parse.mockRestore()
        stringify.mockRestore()
    })

    it('rejects unknown in-memory fields before save serialization', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const definition = { ...VALID, needsWorktree: undefined } as RawActionDefinition

        expect(service.validateDefinition('actions/action.json', definition)).toMatchObject({code: 'unknownField', field: null, fieldPath: 'needsWorktree', valid: false})
        await expect(service.saveDefinition('actions/action.json', definition)).rejects.toThrow(/Unknown action field needsWorktree/u)
        expect(persistActionFile).not.toHaveBeenCalled()
    })

    it('does not route incidental field words in ids to a control', () => {
        const service = new ActionService()

        // Id contains the substrings `model`, `agent`, and `on`; must not be routed by text.
        const tricky = { ...VALID, id: 'model-agent-action', onBefore: ['missing'] }
        const result = service.validateDefinition('actions/action.json', tricky)

        expect(result).toMatchObject({ code: 'unknown-action', field: 'onBefore', valid: false })
    })

    it('loads retired capability values but blocks saving them with structured errors', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        const retiredModel = {
            description: 'Do it', id: 'agent-do', label: 'Do',
            agent: 'codex', model: 'retired-model', prompt: 'Run', type: 'agent',
        } satisfies RawActionDefinition
        service.loadFromFiles([file(retiredModel)])

        expect(service.getActionByPath('actions/action.json')).toMatchObject({ model: 'retired-model' })
        expect(service.validateDefinition('actions/action.json', retiredModel))
            .toMatchObject({ code: 'unknown-model', field: 'model', valid: false })
        await expect(service.saveDefinition('actions/action.json', retiredModel)).rejects.toThrow(/Unknown model/u)
        expect(persistActionFile).not.toHaveBeenCalled()

        const invalidThinkingLevel = { ...retiredModel, model: 'gpt-5.5', thinkingLevel: 'extreme' }
        expect(service.validateDefinition('actions/action.json', invalidThinkingLevel))
            .toMatchObject({ code: 'invalid-thinking-level', field: 'thinkingLevel', valid: false })
    })

    it('persists and publishes only valid definitions', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (actionFile: ActionFile) => {
            persistedFiles.push(actionFile)
        })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const loaded = service.getActionByPath('actions/action.json')
        if (!loaded) throw new Error('Missing loaded action')
        const phrases = [{ text: '**Run tests**', title: 'Tests' }, { text: 'Show diff', title: '' }]
        const definition = { ...editableActionDefinition(loaded), label: 'Updated', phrases }

        await service.saveDefinition('actions/action.json', definition)

        expect(persistActionFile).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('"label": "Updated"'), path: 'actions/action.json'}))
        expect(service.getActionByPath('actions/action.json')?.label).toBe('Updated')
        expect(service.getActionByPath('actions/action.json')?.phrases).toEqual(phrases)
        expect(persistActionFile).toHaveBeenCalledWith({
            content: serializeActionDefinition(definition),
            path: 'actions/action.json',
        })
        const persistedFile = persistedFiles[0]
        if (!persistedFile) throw new Error('Missing persisted action file')
        expect(JSON.parse(persistedFile.content).phrases).toEqual(phrases)

        const invalid = { ...definition, label: ' \t\u2003' }
        expect(service.validateDefinition('actions/action.json', invalid)).toMatchObject({ field: 'label', valid: false })
        await expect(service.saveDefinition('actions/action.json', invalid)).rejects.toThrow(/field label/u)
        expect(persistActionFile).toHaveBeenCalledTimes(1)
        expect(service.getActionByPath('actions/action.json')?.label).toBe('Updated')
    })

    it('queues a label-derived path and re-keys the action after the move commits', async () => {
        let completeMove: ((fromPath: string, toPath: string) => void) | undefined
        const persistActionFile = vi.fn(async (
            _actionFile: ActionFile,
            _sourcePath?: string,
            onPathCommitted?: (fromPath: string, toPath: string) => void,
        ) => {
            completeMove = onPathCommitted
        })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([fileAt('actions/new-action.json', { ...VALID, label: 'New action' })])
        const draft = service.getDraft('actions/new-action.json').definition

        service.updateDraft('actions/new-action.json', { ...draft, label: 'Review Code!' })
        await service.flushDrafts()

        expect(persistActionFile).toHaveBeenLastCalledWith(
            expect.objectContaining({ path: 'actions/review-code.json' }),
            'actions/new-action.json',
            expect.any(Function),
            true,
        )
        expect(service.getActionByPath('actions/new-action.json')?.label).toBe('Review Code!')
        completeMove?.('actions/new-action.json', 'actions/review-code.json')
        expect(service.getActionByPath('actions/new-action.json')).toBeNull()
        expect(service.getActionByPath('actions/review-code.json')?.label).toBe('Review Code!')
        expect(service.getDraft('actions/review-code.json').definition.label).toBe('Review Code!')
    })

    it('adds a suffix when a label-derived action path is already occupied', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (actionFile: ActionFile) => { persistedFiles.push(actionFile) })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([
            fileAt('actions/new-action.json', { ...VALID, label: 'New action' }),
            fileAt('actions/review.json', { ...VALID, id: 'action-review', label: 'Review' }),
        ])
        const draft = service.getDraft('actions/new-action.json').definition

        service.updateDraft('actions/new-action.json', { ...draft, label: 'Review' })
        await service.flushDrafts()

        expect(persistedFiles.at(-1)?.path).toBe('actions/review-2.json')
    })

    it('retargets a newly created action before its first batch commits', async () => {
        const persistenceCalls: unknown[][] = []
        const persistActionFile = vi.fn(async (...args: unknown[]) => { persistenceCalls.push(args) })
        const service = new ActionService(() => ({ persistActionFile }))
        const { definition, path } = service.createDefinition('actions')

        await service.saveDefinition(path, definition)
        const draft = service.getDraft(path).definition
        service.updateDraft(path, { ...draft, label: 'Review code' })
        await service.flushDrafts()

        expect(persistenceCalls.at(-1)).toEqual([
            expect.objectContaining({ path: 'actions/review-code.json' }),
            'actions/new-action.json',
            expect.any(Function),
            false,
        ])
    })

    it('sends identical canonical JSON to web, desktop-local, and remote-control persistence gateways', async () => {
        const persistedFiles = new Map<string, ActionFile>()
        const storageModes = ['web', 'desktop-local', 'remote-control']
        const definition = { ...VALID, label: 'Canonical label' }

        for (const storageMode of storageModes) {
            const service = new ActionService(() => ({
                persistActionFile: vi.fn(async (actionFile: ActionFile) => {
                    persistedFiles.set(storageMode, actionFile)
                }),
            }))
            await service.saveDefinition('actions/action.json', definition)
        }

        const expectedFile = { content: serializeActionDefinition(definition), path: 'actions/action.json' }
        expect(Object.fromEntries(persistedFiles)).toEqual({
            'desktop-local': expectedFile,
            'remote-control': expectedFile,
            web: expectedFile,
        })
    })

    it('revalidates then serializes exactly once at the persistence boundary', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const definition = { ...VALID, icon: undefined, label: 'Updated' }
        expect(service.validateDefinition('actions/action.json', definition)).toMatchObject({ valid: true })
        const parse = vi.spyOn(JSON, 'parse')
        const stringify = vi.spyOn(JSON, 'stringify')

        await service.saveDefinition('actions/action.json', definition)

        expect(parse).not.toHaveBeenCalled()
        expect(stringify).toHaveBeenCalledTimes(1)
        expect(persistActionFile).toHaveBeenCalledTimes(1)
        parse.mockRestore()
        stringify.mockRestore()
    })

    it('blocks a draft that becomes invalid after earlier validation', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const definition = { ...VALID }
        expect(service.validateDefinition('actions/action.json', definition)).toMatchObject({ valid: true })
        definition.label = ''
        const stringify = vi.spyOn(JSON, 'stringify')

        await expect(service.saveDefinition('actions/action.json', definition)).rejects.toThrow(/field label/u)

        expect(stringify).not.toHaveBeenCalled()
        expect(persistActionFile).not.toHaveBeenCalled()
        stringify.mockRestore()
    })

    it('does not publish when persistence serialization throws', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
            throw new Error('serialization failed')
        })

        await expect(service.saveDefinition('actions/action.json', { ...VALID, label: 'Updated' }))
            .rejects.toThrow('serialization failed')

        expect(persistActionFile).not.toHaveBeenCalled()
        expect(service.getActionByPath('actions/action.json')?.label).toBe(VALID.label)
        stringify.mockRestore()
    })

    it('retains invalid dirty drafts until repaired and flushed', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])

        service.updateDraft('actions/action.json', { ...VALID, label: '' })

        expect(service.hasPendingDrafts()).toBe(true)
        expect(service.getDraft('actions/action.json').validation.valid).toBe(false)
        await expect(service.flushDrafts()).rejects.toThrow(/invalid unsaved changes/u)
        expect(persistActionFile).not.toHaveBeenCalled()

        service.updateDraft('actions/action.json', { ...VALID, label: 'Repaired' })
        await service.flushDrafts()

        expect(service.hasPendingDrafts()).toBe(false)
        expect(persistActionFile).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('"label": "Repaired"') }),
            'actions/action.json',
            expect.any(Function),
            true,
        )
    })

    it('keeps failed drafts retryable through the shared coordinator', async () => {
        const persistActionFile = vi.fn()
            .mockRejectedValueOnce(new Error('disk unavailable'))
            .mockResolvedValueOnce(undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])

        service.updateDraft('actions/action.json', { ...VALID, label: 'Retry me' })
        await expect(service.flushDrafts()).rejects.toThrow('disk unavailable')
        expect(service.getDraft('actions/action.json').error).toBe('disk unavailable')
        expect(service.hasPendingDrafts()).toBe(true)

        service.retryDraft('actions/action.json')
        await service.flushDrafts()

        expect(persistActionFile).toHaveBeenCalledTimes(2)
        expect(service.hasPendingDrafts()).toBe(false)
    })

    it('keeps graph validation at the persistence boundary', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const stringify = vi.spyOn(JSON, 'stringify')

        service.updateDraft('actions/action.json', { ...VALID, onBefore: ['missing'] })

        expect(service.getDraft('actions/action.json').validation.valid).toBe(true)
        await expect(service.flushDrafts()).rejects.toThrow(/Unknown action id missing/u)
        expect(stringify).not.toHaveBeenCalled()
        expect(persistActionFile).not.toHaveBeenCalled()
        stringify.mockRestore()
    })

    it('does not run whole-graph validation for field feedback in a large graph', () => {
        const service = new ActionService()
        const actionFiles = Array.from({ length: 200 }, (_value, index) => ({
            content: JSON.stringify({ ...VALID, id: `action-${index}`, label: `Action ${index}` }),
            path: `actions/action-${index}.json`,
        }))
        service.loadFromFiles(actionFiles)
        const graphValidation = vi.spyOn(service, 'validateDefinition')

        service.updateDraft('actions/action-0.json', { ...VALID, id: 'action-0', label: '' })

        expect(service.getDraft('actions/action-0.json').validation).toMatchObject({ field: 'label', valid: false })
        expect(graphValidation).not.toHaveBeenCalled()
    })

    it('ignores a stale local echo by explicit publication revision', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (actionFile: ActionFile) => { persistedFiles.push(actionFile) })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([fileAt('actions/do.json', VALID)])

        service.updateDraft('actions/do.json', { ...VALID, label: 'Do!' })
        await service.flushDrafts()
        const firstPublicationRevision = service.getPublicationRevision('actions/do.json')
        const firstFile = persistedFiles[0]
        if (!firstFile) throw new Error('Missing first persisted action')
        service.updateDraft('actions/do.json', { ...VALID, label: 'Do?' })
        await service.flushDrafts()

        service.reloadFromFiles(
            [firstFile],
            [{ origin: 'local', path: firstFile.path, revision: firstPublicationRevision }],
        )

        expect(service.getDefinitionByPath(firstFile.path)?.label).toBe('Do?')
        expect(service.getDraft(firstFile.path).conflict).toBeNull()
    })

    it('treats a genuine external change matching an older snapshot as a conflict', async () => {
        const service = new ActionService(() => ({ persistActionFile: vi.fn(async () => undefined) }))
        const initialFile = file(VALID)
        service.loadFromFiles([initialFile])
        service.updateDraft('actions/action.json', { ...VALID, label: 'Saved local edit' })
        await service.flushDrafts()
        service.updateDraft('actions/action.json', { ...VALID, label: '' })

        service.reloadFromFiles(
            [initialFile],
            [{ origin: 'external', path: initialFile.path }],
        )

        expect(service.getDraft(initialFile.path).conflict?.label).toBe(VALID.label)
        expect(service.getDraft(initialFile.path).definition.label).toBe('')
    })

    it('treats reordered arrays as meaningful external changes', () => {
        const phrases = [{ text: 'First', title: 'First' }, { text: 'Second', title: 'Second' }]
        const service = new ActionService()
        service.loadFromFiles([file({ ...VALID, phrases })])
        service.updateDraft('actions/action.json', { ...VALID, label: '', phrases })

        service.reloadFromFiles(
            [file({ ...VALID, phrases: [...phrases].reverse() })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )

        expect(service.getDraft('actions/action.json').conflict?.phrases).toEqual([...phrases].reverse())
    })

    it('drops a clean draft when its action is deleted externally', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.getDraft('actions/action.json')

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(service.getActionByPath('actions/action.json')).toBeNull()
        expect(service.getDeletedDraftActions()).toEqual([])
        expect(() => service.getDraft('actions/action.json')).toThrow(/unknown action/u)
    })

    it('preserves a dirty deleted draft until explicit discard', async () => {
        const gateway = deletionGateway()
        const service = new ActionService(() => gateway)
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: '' })

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(service.getDraft('actions/action.json')).toMatchObject({ deleted: true, definition: { label: '' } })
        expect(service.getDeletedDraftActions()).toHaveLength(1)
        await expect(service.flushDrafts()).rejects.toThrow(/requires explicit recovery or discard/u)

        service.discardDeletedDraft('actions/action.json')
        expect(service.getDeletedDraftActions()).toEqual([])
    })

    it('cancels queued persistence and preserves its draft after external deletion', async () => {
        let pending = false
        const discardPendingActionFile = vi.fn(() => { pending = false })
        const service = new ActionService(() => ({
            discardPendingActionFile,
            hasPendingActionFile: () => pending,
            persistActionFile: vi.fn(async () => { pending = true }),
        }))
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: 'Queued edit' })
        await service.flushDrafts()

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(discardPendingActionFile).toHaveBeenCalledWith('actions/action.json')
        expect(pending).toBe(false)
        expect(service.getDraft('actions/action.json')).toMatchObject({ deleted: true, definition: { label: 'Queued edit' } })
        expect(service.hasPendingDrafts()).toBe(true)
    })

    it('ignores an in-flight save completion after external deletion', async () => {
        let finishPersistence: () => void = () => undefined
        const persistence = new Promise<void>((resolve) => { finishPersistence = resolve })
        const service = new ActionService(() => ({ persistActionFile: vi.fn(() => persistence) }))
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: 'In-flight edit' })
        await Promise.resolve()

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])
        finishPersistence()
        await Promise.resolve()
        await Promise.resolve()

        expect(service.getActionByPath('actions/action.json')).toBeNull()
        expect(service.getDefinitionByPath('actions/action.json')).toBeNull()
        expect(service.getDraft('actions/action.json')).toMatchObject({ deleted: true, definition: { label: 'In-flight edit' } })
    })

    it('recreates a deleted dirty action only after explicit recovery', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const gateway = { ...deletionGateway(), persistActionFile }
        const service = new ActionService(() => gateway)
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: '' })
        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])
        service.updateDraft('actions/action.json', { ...VALID, label: 'Recovered' })

        expect(persistActionFile).not.toHaveBeenCalled()
        service.recreateDeletedDraft('actions/action.json')

        await vi.waitFor(() => {
            expect(persistActionFile).toHaveBeenCalledOnce()
            expect(service.getActionByPath('actions/action.json')?.label).toBe('Recovered')
            expect(service.getDraft('actions/action.json').deleted).toBe(false)
        })
    })

    it('keeps a dirty moved action at its old path while loading the new path', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: '' })
        const movedFile = { content: JSON.stringify({ ...VALID, id: 'action-moved', label: 'Moved' }), path: 'actions/moved.json' }

        service.reloadFromFiles([movedFile], [
            { origin: 'external', path: 'actions/action.json' },
            { origin: 'external', path: 'actions/moved.json' },
        ])

        expect(service.getDraft('actions/action.json').deleted).toBe(true)
        expect(service.getActionByPath('actions/moved.json')?.label).toBe('Moved')
    })

    it('turns same-path recreation into an explicit external conflict', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.updateDraft('actions/action.json', { ...VALID, label: '' })
        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        service.reloadFromFiles(
            [file({ ...VALID, label: 'Recreated externally' })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )

        expect(service.getDraft('actions/action.json')).toMatchObject({
            conflict: { label: 'Recreated externally' },
            definition: { label: '' },
            deleted: false,
        })
    })
})
