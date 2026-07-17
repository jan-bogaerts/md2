import { describe, expect, it, vi } from 'vitest'
import { ActionService, editableActionDefinition, serializeActionDefinition } from './action_service'
import {
    CUSTOM_PROMPT_ACTION_ID,
    REMARKABLE_CONVERT_ACTION_ID,
    type ActionFile,
    type RawActionDefinition,
} from '../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

const VALID: RawActionDefinition = { command: 'run', description: 'Do it', id: 'action-do', label: 'Do', type: 'command' }

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
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])

        service.setSelectedEditorTab('actions/action.json', 'prompt')
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual({ selectedTab: 'prompt' })

        service.reloadFromFiles([file({ ...VALID, label: 'Reloaded' })], ['actions/action.json'])
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual({ selectedTab: 'prompt' })

        await service.saveDefinition('actions/action.json', { ...VALID, label: 'Saved' })
        expect(service.getActionByPath('actions/action.json')?.editorState).toEqual({ selectedTab: 'prompt' })
        expect(persistActionFile).toHaveBeenCalledWith(expect.objectContaining({ content: expect.not.stringContaining('editorState') }))
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

        service.reloadFromFiles([file({ ...VALID, type: 'bad' }), file(replacement)], ['actions/action.json'])

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

        expect(service.validateDefinition('actions/action.json', { ...VALID, icon: undefined, label: '' }))
            .toMatchObject({ field: 'label', valid: false })
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
})
