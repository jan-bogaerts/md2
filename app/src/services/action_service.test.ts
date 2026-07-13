import { describe, expect, it, vi } from 'vitest'
import { ActionService, editableActionDefinition } from './action_service'
import { CUSTOM_PROMPT_ACTION_NAME, type ActionFile } from '../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

const VALID = { command: 'run', description: 'Do it', id: 'action-do', label: 'Do', name: 'do', type: 'command' }

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
        expect(service.validateDefinition(first.path, first.definition)).toEqual({ error: null, field: null, valid: true })
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
