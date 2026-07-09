import { describe, expect, it } from 'vitest'
import { loadActionDefinitions } from '../shared/action_definitions.mjs'

function file(name, definition) {
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
    it('parses valid definitions and resolves shared refs', () => {
        const runLint = { description: 'Lint', label: 'Lint', name: 'runLint', text: 'npm run lint', type: 'cmd' }
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, after: ['runLint'] }),
            file('lint', runLint),
        ])
        const implement = actions.find((action) => action.name === 'implement')
        const lint = actions.find((action) => action.name === 'runLint')

        expect(implement?.after[0]).toBe(lint)
    })

    it('rejects invalid definitions with the shared validator', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, type: 'shell' })])).toThrow(/Invalid action type/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, before: ['missing'] })])).toThrow(/Unknown action ref/u)
    })
})
