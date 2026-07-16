import { describe, expect, it } from 'vitest'
import {
    ActionValidationError,
    loadActionDefinitions,
    sanitizeActionValidationError,
    validateActionDefinition,
} from '../../../shared/action_definitions.mjs'
import { ACTION_DEFINITION_VALIDATION_PARITY_CASES } from '../../../shared/action_definition_validation_parity_cases.mjs'

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
    it.each(ACTION_DEFINITION_VALIDATION_PARITY_CASES)(
        'matches React validator metadata for $name',
        ({ expected, files }) => {
            expect(validationError(files)).toMatchObject(expected)
        },
    )

    it('parses canonical definitions and resolves shared ID links', () => {
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, onAfter: [LINT.id], phrases: [{ text: '**Run tests**', title: 'Tests' }] }),
            file('lint', LINT),
        ])
        const implement = actions.find(({ id }) => id === IMPLEMENT.id)
        const lint = actions.find(({ id }) => id === LINT.id)

        expect(implement.onAfter[0]).toBe(lint)
        expect(implement.phrases).toEqual([{ text: '**Run tests**', title: 'Tests' }])
        expect(implement.sourcePath).toBe('actions/implement.json')
        expect(lint.phrases).toEqual([])
    })

    it.each([
        ['non-list phrases', { ...IMPLEMENT, phrases: 'nope' }],
        ['non-object phrase', { ...IMPLEMENT, phrases: ['nope'] }],
        ['missing phrase title', { ...IMPLEMENT, phrases: [{ text: 'Run' }] }],
        ['missing phrase text', { ...IMPLEMENT, phrases: [{ title: 'Run' }] }],
        ['unknown phrase field', { ...IMPLEMENT, phrases: [{ label: 'Run', text: 'Run', title: '' }] }],
    ])('rejects %s', (_label, definition) => {
        expect(validationError([file('implement', definition)])).toMatchObject({ field: 'phrases' })
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

    it.each([
        ['top-level typo', { ...IMPLEMENT, needsWorktree: true }, { field: null, fieldPath: 'needsWorktree' }],
        ['case-only typo', { ...IMPLEMENT, Label: 'Wrong case' }, { field: null, fieldPath: 'Label' }],
        ['nested on field', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: 'ok', unexpected: true }] }, { field: 'on', fieldPath: 'on[0].unexpected', index: 0 }],
        ['unknown appliesTo field', { ...IMPLEMENT, appliesTo: { audience: 'developers', type: 'feature' } }, { field: 'appliesTo', fieldPath: 'appliesTo.audience' }],
    ])('rejects %s with exact unknown-field metadata', (_label, definition, expected) => {
        const files = definition.on ? [file('implement', definition), file('lint', LINT)] : [file('implement', definition)]
        const error = validationError(files)

        expect(error).toMatchObject({ code: 'unknownField', sourcePath: 'actions/implement.json', ...expected })
    })

    it('rejects own undefined draft fields but ignores inherited properties', () => {
        expect(() => validateActionDefinition({ ...IMPLEMENT, needsWorktree: undefined }, 'actions/draft.json'))
            .toThrow(/Unknown action field needsWorktree/u)

        const definition = Object.assign(Object.create({ needsWorktree: true }), IMPLEMENT)
        expect(() => validateActionDefinition(definition, 'actions/inherited.json')).not.toThrow()
    })

    it('accepts a complete definition using every canonical nested field', () => {
        const definition = {
            ...IMPLEMENT,
            agent: 'codex',
            appliesTo: {
                file: 'design/F-010.md', folder: 'design', kind: 'card', state: 'ready', type: 'feature',
                worktree: '1', worktreeError: 'none',
            },
            icon: 'implement.svg',
            model: 'gpt-5',
            needsWorkTree: true,
            on: [{ actionId: LINT.id, condition: 'done' }],
            onAfter: [LINT.id],
            onBefore: [LINT.id],
            onState: 'ready',
            thinkingLevel: 'high',
        }
        const profiles = [{ command: 'codex', models: ['gpt-5'], name: 'codex' }]

        expect(() => loadActionDefinitions([file('implement', definition), file('lint', LINT)], { profiles })).not.toThrow()
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

    it.each([
        ['id', { ...IMPLEMENT, id: ' \t\r\n' }],
        ['name', { ...IMPLEMENT, name: '\u00a0\u2003' }],
        ['label', { ...IMPLEMENT, label: ' \t' }],
        ['description', { ...IMPLEMENT, description: '\r\n\u3000' }],
        ['prompt', { ...IMPLEMENT, prompt: ' \t\r\n\u00a0' }],
        ['command', { ...LINT, command: '\r\n\u2003' }],
    ])('rejects ASCII and Unicode whitespace-only %s', (field, definition) => {
        const error = validationError([file('invalid', definition)])

        expect(error).toMatchObject({ code: 'missing-field', field })
    })

    it('rejects surrounding whitespace in action identities and linked ids', () => {
        expect(validationError([file('implement', { ...IMPLEMENT, id: ` ${IMPLEMENT.id}` })]))
            .toMatchObject({ code: 'invalid-field', field: 'id' })
        expect(validationError([
            file('implement', IMPLEMENT),
            file('lint', { ...LINT, name: ` ${IMPLEMENT.name} ` }),
        ])).toMatchObject({ code: 'invalid-field', field: 'name', sourcePath: 'actions/lint.json' })
        expect(validationError([
            file('implement', { ...IMPLEMENT, onAfter: [`${LINT.id} `] }),
            file('lint', LINT),
        ])).toMatchObject({ code: 'invalid-field', field: 'onAfter', index: 0 })
        expect(validationError([
            file('implement', { ...IMPLEMENT, on: [{ actionId: ` ${LINT.id}`, condition: 'ok' }] }),
            file('lint', LINT),
        ])).toMatchObject({ code: 'invalid-field', field: 'on', index: 0 })
    })

    it('preserves meaningful executable indentation and accepts an escaped-space regular expression', () => {
        const prompt = '  first line\n\tsecond line'
        const command = '  npm run lint\n\techo done'
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: '\\x20' }], prompt }),
            file('lint', { ...LINT, command }),
        ])

        expect(actions.find(({ id }) => id === IMPLEMENT.id)).toMatchObject({ prompt })
        expect(actions.find(({ id }) => id === LINT.id)).toMatchObject({ command })
    })

    it('rejects a raw whitespace-only regular expression at its exact list index', () => {
        const error = validationError([
            file('implement', {
                ...IMPLEMENT,
                on: [
                    { actionId: LINT.id, condition: 'ok' },
                    { actionId: LINT.id, condition: ' \t\r\n\u2003' },
                ],
            }),
            file('lint', LINT),
        ])

        expect(error).toMatchObject({ code: 'missing-field', field: 'on', index: 1 })
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
