import { describe, expect, it } from 'vitest'
import { loadActionDefinitions } from './action_definition_loader'
import { CUSTOM_PROMPT_ACTION_NAME } from '../data/action_types'
import type { ActionFile } from '../data/action_types'

function file(name: string, definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${name}.json` }
}

const IMPLEMENT = {
    description: 'Implement this feature',
    label: 'Implement',
    name: 'implement',
    text: 'use /implement-feature on {{file}}',
    type: 'agent',
}

describe('loadActionDefinitions', () => {
    it('parses a valid definition with all optional fields', () => {
        const actions = loadActionDefinitions([file('implement', {
            ...IMPLEMENT,
            appliesTo: { state: 'design', type: 'feature' },
            icon: 'icon.svg',
            onState: 'implementing',
        })])
        const implement = actions.find((action) => action.name === 'implement')

        expect(implement).toMatchObject({
            appliesTo: { state: 'design', type: 'feature' },
            builtin: false,
            icon: 'icon.svg',
            onState: 'implementing',
            type: 'agent',
        })
    })

    it('always includes the built-in custom prompt action', () => {
        const actions = loadActionDefinitions([])
        const builtin = actions.find((action) => action.name === CUSTOM_PROMPT_ACTION_NAME)

        expect(builtin?.builtin).toBe(true)
        expect(builtin?.type).toBe('agent')
    })

    it('resolves inline and by-name refs to the same underlying definition', () => {
        const runLint = { description: 'Lint', label: 'Lint', name: 'runLint', text: 'npm run lint', type: 'cmd' }
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, after: ['runLint'] }),
            file('check', { description: 'Check', label: 'Check', name: 'check', text: 'echo', type: 'cmd', before: [runLint] }),
        ])
        const fromRef = actions.find((action) => action.name === 'implement')?.after[0]
        const fromInline = actions.find((action) => action.name === 'check')?.before[0]
        const registered = actions.find((action) => action.name === 'runLint')

        expect(fromRef).toBe(registered)
        expect(fromInline).toBe(registered)
    })

    it('resolves on-rule actions to shared definitions', () => {
        const retry = { description: 'Retry', label: 'Retry', name: 'retry', text: 'retry', type: 'cmd' }
        const actions = loadActionDefinitions([
            file('retry', retry),
            file('implement', { ...IMPLEMENT, on: [{ action: 'retry', condition: 'error' }] }),
        ])
        const rule = actions.find((action) => action.name === 'implement')?.on[0]

        expect(rule?.condition).toBe('error')
        expect(rule?.action).toBe(actions.find((action) => action.name === 'retry'))
    })

    it('throws on invalid json', () => {
        expect(() => loadActionDefinitions([{ content: '{ not json', path: 'actions/bad.json' }])).toThrow(/Invalid action json/u)
    })

    it('throws on a missing required field', () => {
        const withoutText = { description: 'x', label: 'x', name: 'implement', type: 'agent' }
        expect(() => loadActionDefinitions([file('implement', withoutText)])).toThrow(/text/u)
    })

    it('throws on an invalid type', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, type: 'shell' })])).toThrow(/Invalid action type/u)
    })

    it('throws on an unknown ref', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, before: ['missing'] })])).toThrow(/Unknown action ref/u)
    })

    it('throws on a duplicate name', () => {
        expect(() => loadActionDefinitions([file('a', IMPLEMENT), file('b', IMPLEMENT)])).toThrow(/Duplicate action name/u)
    })

    it('rejects reuse of the reserved built-in name', () => {
        expect(() => loadActionDefinitions([file('x', { ...IMPLEMENT, name: CUSTOM_PROMPT_ACTION_NAME })])).toThrow(/reserved/u)
    })

    it('detects a circular reference across actions', () => {
        const first = { description: 'A', label: 'A', name: 'a', text: 'a', type: 'cmd', before: ['b'] }
        const second = { description: 'B', label: 'B', name: 'b', text: 'b', type: 'cmd', before: ['a'] }
        expect(() => loadActionDefinitions([file('a', first), file('b', second)])).toThrow(/Circular action reference/u)
    })
})
