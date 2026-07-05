import { describe, expect, it } from 'vitest'
import { ActionService } from './action_service'
import { CUSTOM_PROMPT_ACTION_NAME, type ActionFile } from '../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

const VALID = { description: 'Do it', label: 'Do', name: 'do', text: 'run', type: 'cmd' }

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

        service.reloadFromFiles([file({ ...VALID, type: 'bad' })], 'actions/action.json')

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
})
