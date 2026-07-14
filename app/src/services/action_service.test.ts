import { describe, expect, it, vi } from 'vitest'
import { ActionService, editableActionDefinition } from './action_service'
import { CUSTOM_PROMPT_ACTION_ID, CUSTOM_PROMPT_ACTION_NAME, type ActionFile, type RawActionDefinition } from '../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

const VALID: RawActionDefinition = { command: 'run', description: 'Do it', id: 'action-do', label: 'Do', name: 'do', type: 'command' }

describe('ActionService', () => {
    it('exposes only the built-in action before loading', () => {
        const service = new ActionService()

        expect(service.getActions().map((action) => action.name)).toEqual([CUSTOM_PROMPT_ACTION_NAME])
    })

    it('loads project action files alongside the built-in and notifies listeners', () => {
        const service = new ActionService()
        let notified = 0
        service.addEventListener('changed', () => { notified += 1 })

        service.loadFromFiles([file(VALID)])

        expect(service.getActions().map((action) => action.name)).toContain('do')
        expect(service.getActions().map((action) => action.name)).toContain(CUSTOM_PROMPT_ACTION_NAME)
        expect(notified).toBe(1)
    })

    it('fails fast and keeps state unchanged on invalid definitions', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        expect(() => service.loadFromFiles([file({ ...VALID, type: 'bad' })])).toThrow()
        expect(service.getActions().map((action) => action.name)).toContain('do')
    })

    it('retains previous valid actions and exposes reload errors', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        service.reloadFromFiles([file({ ...VALID, type: 'bad' })], ['actions/action.json'])

        expect(service.getActions().map((action) => action.name)).toContain('do')
        expect(service.getState().error).toContain('actions/action.json')
        expect(service.getState().error).toContain('Invalid action type')
    })

    it('finds matching onState actions for the current context', () => {
        const service = new ActionService()
        service.loadFromFiles([file({ ...VALID, appliesTo: { type: 'feature' }, onState: 'ready' })])

        const matches = service.getActionsForStateTrigger('ready', { file: 'design/F-010.md', kind: 'card', state: 'ready', type: 'feature' })

        expect(matches.map((action) => action.name)).toEqual(['do'])
    })

    it('clears back to the built-in action', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        service.clear()

        expect(service.getActions().map((action) => action.name)).toEqual([CUSTOM_PROMPT_ACTION_NAME])
    })

    it('creates a valid agent definition with generated stable identity and path', () => {
        const service = new ActionService()
        const first = service.createDefinition('design/actions')

        expect(first.path).toBe('design/actions/new-action.json')
        expect(first.definition).toMatchObject({
            description: expect.any(String), id: expect.any(String), label: 'New action',
            name: 'new-action', prompt: expect.any(String), type: 'agent',
        })
        expect(service.validateDefinition(first.path, first.definition)).toEqual({ code: null, error: null, field: null, index: null, valid: true })
    })

    it('routes validation failures by structured metadata, not message text', () => {
        const service = new ActionService()
        service.loadFromFiles([file(VALID)])

        // Missing required field: routed to the exact field with a stable code.
        expect(service.validateDefinition('actions/action.json', { ...VALID, label: '' }))
            .toMatchObject({ code: 'missing-field', field: 'label', valid: false })

        // Duplicate id originating in another file: routed to `id`, never text-matched.
        service.loadFromFiles([file(VALID)])
        const other = { ...VALID, command: 'x', id: 'action-other', name: 'other' }
        expect(service.validateDefinition('actions/other.json', { ...other, id: VALID.id }))
            .toMatchObject({ code: 'duplicate-id', field: 'id', valid: false })

        // Unknown action id at a specific list index keeps the index.
        expect(service.validateDefinition('actions/action.json', { ...VALID, onBefore: [CUSTOM_PROMPT_ACTION_ID, 'missing'] }))
            .toMatchObject({ code: 'unknown-action', field: 'onBefore', index: 1, valid: false })

        // Circular reference and definition-level errors carry no field (general summary).
        expect(service.validateDefinition('actions/action.json', { ...VALID, onBefore: [VALID.id] }))
            .toMatchObject({ code: 'circular-reference', field: null, valid: false })
    })

    it('does not route incidental field words in ids to a control', () => {
        const service = new ActionService()

        // Id contains the substrings `model`, `agent`, and `on`; must not be routed by text.
        const tricky = { ...VALID, id: 'model-agent-action', onBefore: ['missing'] }
        const result = service.validateDefinition('actions/action.json', tricky)

        expect(result).toMatchObject({ code: 'unknown-action', field: 'onBefore', valid: false })
    })

    it('persists and publishes only valid definitions', async () => {
        const persistActionFile = vi.fn(async () => undefined)
        const service = new ActionService(() => ({ persistActionFile }))
        service.loadFromFiles([file(VALID)])
        const loaded = service.getActionByPath('actions/action.json')
        if (!loaded) throw new Error('Missing loaded action')
        const definition = { ...editableActionDefinition(loaded), label: 'Updated' }

        await service.saveDefinition('actions/action.json', definition)

        expect(persistActionFile).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('"label": "Updated"'), path: 'actions/action.json'}))
        expect(service.getActionByPath('actions/action.json')?.label).toBe('Updated')

        const invalid = { ...definition, label: '' }
        expect(service.validateDefinition('actions/action.json', invalid)).toMatchObject({ field: 'label', valid: false })
        await expect(service.saveDefinition('actions/action.json', invalid)).rejects.toThrow(/field label/u)
        expect(persistActionFile).toHaveBeenCalledTimes(1)
        expect(service.getActionByPath('actions/action.json')?.label).toBe('Updated')
    })
})
