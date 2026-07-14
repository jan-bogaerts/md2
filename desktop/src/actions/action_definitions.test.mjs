import { describe, expect, it } from 'vitest'
import {
    ActionValidationError,
    loadActionDefinitions,
    sanitizeActionValidationError,
} from '../../../shared/action_definitions.mjs'

// Load and return the thrown ActionValidationError for assertion on its routing metadata.
function validationError(files) {
    try {
        loadActionDefinitions(files)
    } catch (error) {
        return error
    }
    throw new Error('Expected a validation error')
}

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

    it('attaches stable routing metadata to each validator failure', () => {
        const cases = [
            [{ ...IMPLEMENT, label: '' }, { code: 'missing-field', field: 'label' }],
            [{ ...IMPLEMENT, type: 'shell' }, { code: 'invalid-type', field: 'type' }],
            [{ ...IMPLEMENT, icon: 5 }, { code: 'invalid-field', field: 'icon' }],
            [{ ...IMPLEMENT, appliesTo: 'nope' }, { code: 'invalid-applies-to', field: 'appliesTo' }],
            [{ ...IMPLEMENT, onBefore: 'nope' }, { code: 'invalid-list', field: 'onBefore' }],
            [{ ...IMPLEMENT, text: 'legacy' }, { code: 'legacy-field', field: null }],
            [{ ...IMPLEMENT, command: 'x' }, { code: 'field-not-allowed', field: 'command' }],
            [{ ...IMPLEMENT, model: 'm' }, { code: 'agent-required', field: 'model' }],
            [{ ...IMPLEMENT, thinkingLevel: 'high' }, { code: 'agent-model-required', field: 'thinkingLevel' }],
        ]
        for (const [definition, expected] of cases) {
            const error = validationError([file('implement', definition)])
            expect(error).toBeInstanceOf(ActionValidationError)
            expect(error).toMatchObject({ ...expected, sourcePath: 'actions/implement.json' })
        }
    })

    it('keeps list index for unknown ids and invalid regex after reordering rules', () => {
        const unknown = validationError([file('implement', { ...IMPLEMENT, onAfter: [LINT.id, 'missing'] }), file('lint', LINT)])
        expect(unknown).toMatchObject({ code: 'unknown-action', field: 'onAfter', index: 1 })

        const badRegex = validationError([file('implement', {
            ...IMPLEMENT,
            on: [{ actionId: LINT.id, condition: 'ok' }, { actionId: LINT.id, condition: '(' }],
        }), file('lint', LINT)])
        expect(badRegex).toMatchObject({ code: 'invalid-regex', field: 'on', index: 1 })
    })

    it('does not route incidental field words embedded in ids/paths', () => {
        // Id embeds `model`, `agent`, and `on`; routing must ignore the text and use the field.
        const error = validationError([file('implement', { ...IMPLEMENT, id: 'model-agent-on', onBefore: ['missing'] })])
        expect(error).toMatchObject({ code: 'unknown-action', field: 'onBefore', index: 0 })
    })

    it('routes duplicate id from another file and cycles across all three link types', () => {
        const duplicate = validationError([
            file('implement', IMPLEMENT),
            file('clone', { ...LINT, id: IMPLEMENT.id, name: 'clone' }),
        ])
        expect(duplicate).toMatchObject({ code: 'duplicate-id', field: 'id', sourcePath: 'actions/clone.json' })

        // a --onBefore--> b --on--> c --onAfter--> a spans onBefore, on, and onAfter.
        const a = { ...IMPLEMENT, id: 'a', name: 'a', onBefore: ['b'] }
        const b = { ...IMPLEMENT, id: 'b', name: 'b', on: [{ actionId: 'c', condition: 'x' }] }
        const c = { ...IMPLEMENT, id: 'c', name: 'c', onAfter: ['a'] }
        const cycle = validationError([file('a', a), file('b', b), file('c', c)])
        expect(cycle).toMatchObject({ code: 'circular-reference', field: null })
    })

    it('sanitizes validation errors to message-only, logging code and source path', () => {
        const logged = []
        const error = validationError([file('implement', { ...IMPLEMENT, type: 'shell' })])
        const safe = sanitizeActionValidationError(error, (line) => logged.push(line))

        expect(safe).not.toBeInstanceOf(ActionValidationError)
        expect(safe.message).toBe(error.message)
        expect(logged[0]).toContain('code=invalid-type')
        expect(logged[0]).toContain('path=actions/implement.json')
    })
})
