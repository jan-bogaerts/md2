import { describe, expect, it, vi } from 'vitest'
import { ActionService, editableActionDefinition, serializeActionDefinition } from './action_service'
import {
    CUSTOM_PROMPT_ACTION_ID,
    REMARKABLE_CONVERT_ACTION_ID,
    type ActionFile,
    type RawActionDefinition,
} from '../../data/action_types'
import { openFilesService } from '../open_files_service'
import { actionPromptDraftService } from './action_prompt_draft_service'
import { ACTIONS_CHANGED_EVENT, ACTION_DRAFT_CHANGED_EVENT } from './action_service_events'

function file(definition: unknown): ActionFile {
    return fileAt('actions/action.json', definition)
}

function fileAt(path: string, definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path }
}

const VALID: RawActionDefinition = { command: 'run', description: 'Do it', id: 'action-do', label: 'Do', type: 'command' }

function deletionGateway() {
    return {
        discardPendingFile: vi.fn(),
        hasPendingFile: vi.fn(() => false),
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
        service.addEventListener(ACTIONS_CHANGED_EVENT, () => { notified += 1 })

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
        const actionsChanged = vi.fn()
        const draftChanged = vi.fn()
        service.addEventListener(ACTIONS_CHANGED_EVENT, actionsChanged)
        service.addEventListener(ACTION_DRAFT_CHANGED_EVENT, draftChanged)

        const editorState = {
            phrases: [{
                identity: 'phrase-00000000-0000-4000-8000-000000000001',
                phrase: { text: 'Transient text', title: 'Transient title' },
            }],
            selectedTab: 'prompt',
        }
        service.setActionEditorState(VALID.id, editorState)
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(actionsChanged).not.toHaveBeenCalled()
        expect(draftChanged).toHaveBeenCalledTimes(1)

        service.reloadFromFiles(
            [file({ ...VALID, label: 'Reloaded' })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(actionsChanged).toHaveBeenCalledTimes(1)
        expect(draftChanged).toHaveBeenCalledTimes(1)

        await service.saveDefinition('actions/action.json', { ...VALID, label: 'Saved' })
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual(editorState)
        expect(actionsChanged).toHaveBeenCalledTimes(2)
        expect(draftChanged).toHaveBeenCalledTimes(1)
        expect(persistedFiles[0].content).not.toContain('editorState')
        expect(persistedFiles[0].content).not.toContain(editorState.phrases[0].identity)
    })

    it('invalidates a cached prepared prompt after saving an action definition', async () => {
        const definition: RawActionDefinition = {
            description: 'Review it',
            id: 'action-review',
            label: 'Review',
            prompt: 'Old prompt',
            type: 'agent',
        }
        const service = new ActionService(() => ({ persistActionFile: vi.fn(async () => undefined) }))
        service.loadFromFiles([file(definition)])
        const context = { cardInternalId: 'card-1', kind: 'card' as const }
        const cachedDraft = actionPromptDraftService.getDraft(definition.id, context, null, { prepare: true })
        await cachedDraft.prepare(async () => ({ prompt: definition.prompt as string }))

        await service.saveDefinition('actions/action.json', { ...definition, prompt: 'New prompt' })

        expect(actionPromptDraftService.getDraft(definition.id, context, null, { prepare: true })).not.toBe(cachedDraft)
    })

    it('keeps editor state with each owning action', () => {
        const service = new ActionService()
        service.loadFromFiles([
            file(VALID),
            fileAt('actions/other.json', { ...VALID, id: 'action-other', label: 'Other' }),
        ])
        const firstState = { phrases: [], selectedTab: 'prompt' }
        const otherState = { phrases: [], selectedTab: 'definition' }

        service.setActionEditorState(VALID.id, firstState)
        service.setActionEditorState('action-other', otherState)

        expect(service.getActionByPath('actions/action.json')?.editorState).toBe(firstState)
        expect(service.getActionByPath('actions/other.json')?.editorState).toBe(otherState)
    })

    it('discards editor state when loading another project', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])
        service.setActionEditorState(VALID.id, { phrases: [], selectedTab: 'prompt' })

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

    it('round-trips command-window visibility only when enabled', () => {
        const service = new ActionService()
        service.loadFromFiles([file({ ...VALID, showCommandWindow: true })])
        const visibleAction = service.getActionByPath('actions/action.json')
        if (!visibleAction) throw new Error('Missing visible command action')

        expect(visibleAction.showCommandWindow).toBe(true)
        expect(editableActionDefinition(visibleAction).showCommandWindow).toBe(true)

        service.loadFromFiles([file(VALID)])
        const capturedAction = service.getActionByPath('actions/action.json')
        if (!capturedAction) throw new Error('Missing captured command action')
        expect(capturedAction.showCommandWindow).toBe(false)
        expect(editableActionDefinition(capturedAction)).not.toHaveProperty('showCommandWindow')
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

        service.draftStore.updateDraft(VALID.id, { ...VALID, icon: undefined, label: '' })

        expect(service.draftStore.getDraft(VALID.id).validation).toMatchObject({ field: 'label', valid: false })
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

        expect(persistActionFile).toHaveBeenCalledWith(
            expect.objectContaining({content: expect.stringContaining('"label": "Updated"'), path: 'actions/action.json'}),
            VALID.id,
            'actions/action.json',
            expect.any(Function),
            undefined,
            undefined,
        )
        expect(service.getActionByPath('actions/action.json')?.label).toBe('Updated')
        expect(service.getActionByPath('actions/action.json')?.phrases).toEqual(phrases)
        expect(persistActionFile).toHaveBeenCalledWith(
            { content: serializeActionDefinition(definition), path: 'actions/action.json' },
            VALID.id,
            'actions/action.json',
            expect.any(Function),
            undefined,
            undefined,
        )
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
            _actionId: string,
            _sourcePath?: string,
            onPathCommitted?: (fromPath: string, toPath: string) => void,
        ) => {
            completeMove = onPathCommitted
        })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([fileAt('actions/new-action.json', { ...VALID, label: 'New action' })])
        const draft = service.draftStore.getDraft(VALID.id).definition

        service.draftStore.updateDraft(VALID.id, { ...draft, label: 'Review Code!' })
        await service.draftStore.flushDrafts()
        const changedActionIds: string[] = []
        service.addEventListener(ACTION_DRAFT_CHANGED_EVENT, (event) => {
            const { actionId } = (event as CustomEvent<{ actionId: string }>).detail
            changedActionIds.push(actionId)
            service.draftStore.getDraft(actionId)
        })

        expect(persistActionFile.mock.calls.at(-1)?.slice(0, 4)).toEqual([
            expect.objectContaining({ path: 'actions/review-code.json' }),
            VALID.id,
            'actions/new-action.json',
            expect.any(Function),
        ])
        expect(service.getActionByPath('actions/new-action.json')?.label).toBe('Review Code!')
        completeMove?.('actions/new-action.json', 'actions/review-code.json')
        expect(service.getActionByPath('actions/new-action.json')).toBeNull()
        expect(service.getActionByPath('actions/review-code.json')?.label).toBe('Review Code!')
        expect(service.draftStore.getDraft(VALID.id).definition.label).toBe('Review Code!')
        expect(changedActionIds).toEqual([VALID.id])
    })

    it('reconciles a committed rename after the watcher has already loaded the target path', async () => {
        let completeMove: ((fromPath: string, toPath: string) => void) | undefined
        let pending = true
        const persistActionFile = vi.fn(async (
            _actionFile: ActionFile,
            _actionId: string,
            _sourcePath?: string,
            onPathCommitted?: (fromPath: string, toPath: string) => void,
        ) => {
            completeMove = onPathCommitted
        })
        const service = new ActionService(() => ({
            hasPendingFile: () => pending,
            persistActionFile,
        }))
        service.loadFromFiles([fileAt('actions/test-1.json', { ...VALID, label: 'Test 1' })])
        const editorState = {
            phrases: [],
            selectedTab: 'definition',
        }
        service.setActionEditorState(VALID.id, editorState)
        const renamedDefinition = { ...service.draftStore.getDraft(VALID.id).definition, label: 'Test 1b' }

        service.draftStore.updateDraft(VALID.id, renamedDefinition)
        await service.draftStore.flushDrafts()
        service.reloadFromFiles(
            [fileAt('actions/test-1b.json', renamedDefinition)],
            [
                { origin: 'local', path: 'actions/test-1.json', revision: service.getPublicationRevision('actions/test-1.json') },
                { origin: 'local', path: 'actions/test-1b.json', revision: service.getPublicationRevision('actions/test-1b.json') },
            ],
        )
        pending = false

        expect(service.getActionByPath('actions/test-1b.json')?.editorState).toBe(editorState)
        expect(() => completeMove?.('actions/test-1.json', 'actions/test-1b.json')).not.toThrow()
        expect(() => completeMove?.('actions/test-1.json', 'actions/test-1b.json')).not.toThrow()
        expect(service.getActionByPath('actions/test-1.json')).toBeNull()
        expect(service.getActionByPath('actions/test-1b.json')?.label).toBe('Test 1b')
        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({ deleted: false, definition: renamedDefinition })
    })

    it('keeps a newer staged value separate while reconciling an earlier committed rename', async () => {
        let completeMove: ((fromPath: string, toPath: string) => void) | undefined
        const persistActionFile = vi.fn(async (
            _actionFile: ActionFile,
            _actionId: string,
            _sourcePath?: string,
            onPathCommitted?: (fromPath: string, toPath: string) => void,
        ) => {
            completeMove = onPathCommitted
        })
        const service = new ActionService(() => ({
            hasPendingFile: () => true,
            persistActionFile,
        }))
        service.loadFromFiles([fileAt('actions/test-1.json', { ...VALID, label: 'Test 1' })])
        const renamedDefinition = { ...service.draftStore.getDraft(VALID.id).definition, label: 'Test 1b' }

        service.draftStore.updateDraft(VALID.id, renamedDefinition)
        await service.draftStore.flushDrafts()
        service.draftStore.stageDraft(VALID.id, { ...renamedDefinition, label: '' })
        service.reloadFromFiles(
            [fileAt('actions/test-1b.json', renamedDefinition)],
            [
                { origin: 'local', path: 'actions/test-1.json', revision: service.getPublicationRevision('actions/test-1.json') },
                { origin: 'local', path: 'actions/test-1b.json', revision: service.getPublicationRevision('actions/test-1b.json') },
            ],
        )

        expect(() => completeMove?.('actions/test-1.json', 'actions/test-1b.json')).not.toThrow()
        expect(service.getActionByPath('actions/test-1b.json')?.label).toBe('Test 1b')
        expect(service.draftStore.getDraft(VALID.id).definition.label).toBe('')
    })

    it('adds a suffix when a label-derived action path is already occupied', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (actionFile: ActionFile) => { persistedFiles.push(actionFile) })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([
            fileAt('actions/new-action.json', { ...VALID, label: 'New action' }),
            fileAt('actions/review.json', { ...VALID, id: 'action-review', label: 'Review' }),
        ])
        const draft = service.draftStore.getDraft(VALID.id).definition

        service.draftStore.updateDraft(VALID.id, { ...draft, label: 'Review' })
        await service.draftStore.flushDrafts()

        expect(persistedFiles.at(-1)?.path).toBe('actions/review-2.json')
    })

    it('retargets a newly created action before its first batch commits', async () => {
        const persistenceCalls: unknown[][] = []
        const persistActionFile = vi.fn(async (...args: unknown[]) => { persistenceCalls.push(args) })
        const service = new ActionService(() => ({ persistActionFile }))
        const { definition, path } = service.createDefinition('actions')

        await service.saveDefinition(path, definition)
        const draft = service.draftStore.getDraft(definition.id).definition
        service.draftStore.updateDraft(definition.id, { ...draft, label: 'Review code' })
        await service.draftStore.flushDrafts()

        expect(persistenceCalls.at(-1)?.slice(0, 4)).toEqual([
            expect.objectContaining({ path: 'actions/review-code.json' }),
            definition.id,
            'actions/new-action.json',
            expect.any(Function),
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

        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })

        expect(service.draftStore.hasPendingDrafts()).toBe(true)
        expect(service.draftStore.getDraft(VALID.id).validation.valid).toBe(false)
        await expect(service.draftStore.flushDrafts()).rejects.toThrow(/invalid unsaved changes/u)
        expect(persistActionFile).not.toHaveBeenCalled()

        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Repaired' })
        await service.draftStore.flushDrafts()

        expect(service.draftStore.hasPendingDrafts()).toBe(true)
        expect(persistActionFile.mock.calls.at(-1)?.slice(0, 4)).toEqual([
            expect.objectContaining({ content: expect.stringContaining('"label": "Repaired"') }),
            VALID.id,
            'actions/action.json',
            expect.any(Function),
        ])
        const persistenceCall = persistActionFile.mock.calls.at(-1) as unknown as unknown[]
        const acknowledge = persistenceCall[5] as (() => void)
        acknowledge()
        expect(service.draftStore.hasPendingDrafts()).toBe(false)
    })

    it('stages editor changes without validation, events, or persistence', () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        service.draftStore.stageDraft(VALID.id, { ...VALID, label: '' })

        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({
            definition: expect.objectContaining({ label: '' }),
            revision: 1,
            validation: { valid: true },
        })
        expect(service.draftStore.hasPendingDrafts()).toBe(true)
        expect(changed).not.toHaveBeenCalled()
        expect(persistActionFile).not.toHaveBeenCalled()
    })

    it('validates and persists a staged editor change only when committed', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        service.draftStore.stageDraft(VALID.id, { ...VALID, label: 'Committed edit' })

        service.draftStore.commitDraft(VALID.id)
        await service.draftStore.flushDrafts()

        expect(persistActionFile.mock.calls.at(-1)?.slice(0, 4)).toEqual([
            expect.objectContaining({ content: expect.stringContaining('"label": "Committed edit"') }),
            VALID.id,
            'actions/action.json',
            expect.any(Function),
        ])
    })

    it.each(['', ' \t\r\n\u2003'])(
        'persists, publishes, and reloads incomplete command text %j',
        async (command) => {
            const persistedFiles: ActionFile[] = []
            const persistActionFile = vi.fn(async (persistedFile: ActionFile) => { persistedFiles.push(persistedFile) })
            const service = new ActionService(() => ({ persistActionFile }))
            const agentDefinition: RawActionDefinition = {description: 'Do it', id: VALID.id, label: 'Action', prompt: 'Run it', type: 'agent'}
            service.loadFromFiles([file(agentDefinition)])
            service.draftStore.stageDraft(VALID.id, {
                command,
                description: agentDefinition.description,
                id: agentDefinition.id,
                label: agentDefinition.label,
                type: 'command',
            })

            service.draftStore.commitDraft(VALID.id)
            await service.draftStore.flushDrafts()

            expect(service.draftStore.getDraft(VALID.id).validation.valid).toBe(true)
            expect(service.getActionByPath('actions/action.json')).toMatchObject({ command, type: 'command' })
            const persistedFile = persistedFiles[0]
            if (!persistedFile) throw new Error('Missing persisted incomplete command action')
            expect(JSON.parse(persistedFile.content).command).toBe(command)

            service.reloadFromFiles(
                [persistedFile],
                [{ origin: 'external', path: 'actions/action.json' }],
            )

            expect(service.getActionByPath('actions/action.json')).toMatchObject({ command, type: 'command' })
            expect(service.draftStore.getDraft(VALID.id).definition.command).toBe(command)
        },
    )

    it('commits staged editor changes before flushing pending work', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Flush edit' })

        await service.draftStore.flushDrafts()

        expect(persistActionFile.mock.calls.at(-1)?.slice(0, 4)).toEqual([
            expect.objectContaining({ content: expect.stringContaining('"label": "Flush edit"') }),
            VALID.id,
            'actions/action.json',
            expect.any(Function),
        ])
    })

    it('keeps failed drafts retryable through the shared coordinator', async () => {
        const persistActionFile = vi.fn()
            .mockRejectedValueOnce(new Error('disk unavailable'))
            .mockResolvedValueOnce(undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])

        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Retry me' })
        await expect(service.draftStore.flushDrafts()).rejects.toThrow('disk unavailable')
        expect(service.draftStore.getDraft(VALID.id).error).toBe('disk unavailable')
        expect(service.draftStore.hasPendingDrafts()).toBe(true)

        service.draftStore.retryDraft(VALID.id)
        await service.draftStore.flushDrafts()

        expect(persistActionFile).toHaveBeenCalledTimes(2)
        const persistenceCall = persistActionFile.mock.calls.at(-1) as unknown as unknown[]
        const acknowledge = persistenceCall[5] as (() => void)
        acknowledge()
        expect(service.draftStore.hasPendingDrafts()).toBe(false)
    })

    it('captures the open-document revision when a draft save is queued', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const getState = () => ({ project: { branch: 'main', id: 'project' }, runningAgents: [], snapshot: null })
        const dataOwner = Object.assign(new EventTarget(), { getState })
        openFilesService.init({ actionService: service, dataService: dataOwner })
        const action = service.getActionByPath('actions/action.json')
        if (!action) throw new Error('Expected loaded action')
        const document = openFilesService.openDocument(action)
        if (document.kind !== 'action') throw new Error('Expected action document')

        try {
            service.draftStore.updateDraft(VALID.id, { ...VALID, description: 'Queued valid edit' })
            service.draftStore.updateDraft(VALID.id, { ...VALID, description: 'Newer invalid edit', label: '' })
            await vi.waitFor(() => expect(persistActionFile).toHaveBeenCalledOnce())
            const persistenceCall = persistActionFile.mock.calls[0] as unknown as unknown[]
            const saveReference = persistenceCall[4] as { acknowledge(): void }

            saveReference.acknowledge()

            expect(document.dirty).toBe(true)
        } finally {
            openFilesService.discardDocument(document)
        }
    })

    it('keeps graph validation at the persistence boundary', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const stringify = vi.spyOn(JSON, 'stringify')

        service.draftStore.updateDraft(VALID.id, { ...VALID, onBefore: ['missing'] })

        expect(service.draftStore.getDraft(VALID.id).validation.valid).toBe(true)
        await expect(service.draftStore.flushDrafts()).rejects.toThrow(/Unknown action id missing/u)
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

        service.draftStore.updateDraft('action-0', { ...VALID, id: 'action-0', label: '' })

        expect(service.draftStore.getDraft('action-0').validation).toMatchObject({ field: 'label', valid: false })
        expect(graphValidation).not.toHaveBeenCalled()
    })

    it('ignores a stale local echo by explicit publication revision', async () => {
        const persistedFiles: ActionFile[] = []
        const persistActionFile = vi.fn(async (actionFile: ActionFile) => { persistedFiles.push(actionFile) })
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([fileAt('actions/do.json', VALID)])

        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Do!' })
        await service.draftStore.flushDrafts()
        const firstPublicationRevision = service.getPublicationRevision('actions/do.json')
        const firstFile = persistedFiles[0]
        if (!firstFile) throw new Error('Missing first persisted action')
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Do?' })
        await service.draftStore.flushDrafts()

        service.reloadFromFiles(
            [firstFile],
            [{ origin: 'local', path: firstFile.path, revision: firstPublicationRevision }],
        )

        expect(service.getDefinitionByPath(firstFile.path)?.label).toBe('Do?')
        expect(service.draftStore.getDraft(VALID.id).conflict).toBeNull()
    })

    it('treats a genuine external change matching an older snapshot as a conflict', async () => {
        const service = new ActionService(() => ({ persistActionFile: vi.fn(async () => undefined) }))
        const initialFile = file(VALID)
        service.loadFromFiles([initialFile])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Saved local edit' })
        await service.draftStore.flushDrafts()
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })

        service.reloadFromFiles(
            [initialFile],
            [{ origin: 'external', path: initialFile.path }],
        )

        expect(service.draftStore.getDraft(VALID.id).conflict?.label).toBe(VALID.label)
        expect(service.draftStore.getDraft(VALID.id).definition.label).toBe('')
    })

    it('treats reordered arrays as meaningful external changes', () => {
        const phrases = [{ text: 'First', title: 'First' }, { text: 'Second', title: 'Second' }]
        const service = new ActionService()
        service.loadFromFiles([file({ ...VALID, phrases })])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '', phrases })

        service.reloadFromFiles(
            [file({ ...VALID, phrases: [...phrases].reverse() })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )

        expect(service.draftStore.getDraft(VALID.id).conflict?.phrases).toEqual([...phrases].reverse())
    })

    it('drops a clean draft when its action is deleted externally', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.draftStore.getDraft(VALID.id)

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(service.getActionByPath('actions/action.json')).toBeNull()
        expect(service.draftStore.getDeletedDraftActions()).toEqual([])
        expect(() => service.draftStore.getDraft(VALID.id)).toThrow(/unknown action/u)
    })

    it('removes an action immediately after its local file deletion is committed', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])

        service.reconcileCommittedDeletion('actions/action.json')

        expect(service.getActionByPath('actions/action.json')).toBeNull()
        expect(service.getFiles()).toEqual([])
    })

    it('preserves a dirty deleted draft until explicit discard', async () => {
        const gateway = deletionGateway()
        const service = new ActionService(() => gateway)
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({ deleted: true, definition: { label: '' } })
        expect(service.draftStore.getDeletedDraftActions()).toHaveLength(1)
        await expect(service.draftStore.flushDrafts()).rejects.toThrow(/requires explicit recovery or discard/u)

        service.draftStore.discardDeletedDraft(VALID.id)
        expect(service.draftStore.getDeletedDraftActions()).toEqual([])
    })

    it('cancels queued persistence and preserves its draft after external deletion', async () => {
        let pending = false
        const discardPendingFile = vi.fn(() => { pending = false })
        const service = new ActionService(() => ({
            discardPendingFile,
            hasPendingFile: () => pending,
            persistActionFile: vi.fn(async () => { pending = true }),
        }))
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Queued edit' })
        await service.draftStore.flushDrafts()

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        expect(discardPendingFile).toHaveBeenCalledWith('actions/action.json')
        expect(pending).toBe(false)
        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({ deleted: true, definition: { label: 'Queued edit' } })
        expect(service.draftStore.hasPendingDrafts()).toBe(true)
    })

    it('ignores an in-flight save completion after external deletion', async () => {
        let finishPersistence: () => void = () => undefined
        const persistence = new Promise<void>((resolve) => { finishPersistence = resolve })
        const service = new ActionService(() => ({ persistActionFile: vi.fn(() => persistence) }))
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'In-flight edit' })
        await Promise.resolve()

        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])
        finishPersistence()
        await Promise.resolve()
        await Promise.resolve()

        expect(service.getActionByPath('actions/action.json')).toBeNull()
        expect(service.getDefinitionByPath('actions/action.json')).toBeNull()
        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({ deleted: true, definition: { label: 'In-flight edit' } })
    })

    it('recreates a deleted dirty action only after explicit recovery', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const gateway = { ...deletionGateway(), persistActionFile }
        const service = new ActionService(() => gateway)
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })
        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: 'Recovered' })

        expect(persistActionFile).not.toHaveBeenCalled()
        service.draftStore.recreateDeletedDraft(VALID.id)

        await vi.waitFor(() => {
            expect(persistActionFile).toHaveBeenCalledOnce()
            expect(service.getActionByPath('actions/action.json')?.label).toBe('Recovered')
            expect(service.draftStore.getDraft(VALID.id).deleted).toBe(false)
        })
    })

    it('keeps a dirty moved action at its old path while loading the new path', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })
        const movedFile = { content: JSON.stringify({ ...VALID, id: 'action-moved', label: 'Moved' }), path: 'actions/moved.json' }

        service.reloadFromFiles([movedFile], [
            { origin: 'external', path: 'actions/action.json' },
            { origin: 'external', path: 'actions/moved.json' },
        ])

        expect(service.draftStore.getDraft(VALID.id).deleted).toBe(true)
        expect(service.getActionByPath('actions/moved.json')?.label).toBe('Moved')
    })

    it('turns same-path recreation into an explicit external conflict', () => {
        const service = new ActionService(() => deletionGateway())
        service.loadFromFiles([file(VALID)])
        service.draftStore.updateDraft(VALID.id, { ...VALID, label: '' })
        service.reloadFromFiles([], [{ origin: 'external', path: 'actions/action.json' }])

        service.reloadFromFiles(
            [file({ ...VALID, label: 'Recreated externally' })],
            [{ origin: 'external', path: 'actions/action.json' }],
        )

        expect(service.draftStore.getDraft(VALID.id)).toMatchObject({
            conflict: { label: 'Recreated externally' },
            definition: { label: '' },
            deleted: false,
        })
    })
})
