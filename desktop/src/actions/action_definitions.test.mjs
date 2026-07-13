import { describe, expect, it } from 'vitest'
import { loadActionDefinitions } from '../../../shared/action_definitions.mjs'

function file(name, definition) {
    return { content: JSON.stringify(definition), path: `actions/${name}.json` }
}

const IMPLEMENT = {
    description: 'Implement this feature', id: 'action-implement', label: 'Implement',
    name: 'implement', prompt: 'use /implement-feature on {{file}}', type: 'agent',
}
const LINT = {
    command: 'npm run lint', description: 'Lint', id: 'action-lint', label: 'Lint', name: 'lint', type: 'command',
}

describe('loadActionDefinitions', () => {
    it('parses canonical definitions and resolves shared ID links', () => {
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, onAfter: [LINT.id] }),
            file('lint', LINT),
        ])
        const implement = actions.find(({ id }) => id === IMPLEMENT.id)
        const lint = actions.find(({ id }) => id === LINT.id)

        expect(implement.onAfter[0]).toBe(lint)
        expect(implement.sourcePath).toBe('actions/implement.json')
    })

    it('rejects legacy, invalid, unknown, and circular definitions through shared validator', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, type: 'shell' })])).toThrow(/Invalid action type/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, onBefore: ['missing'] })])).toThrow(/Unknown action id/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, text: 'legacy' })])).toThrow(/Legacy action field text/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, onBefore: [IMPLEMENT.id] })])).toThrow(/Circular action reference/u)
    })
})
