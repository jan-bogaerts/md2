const BASE_DEFINITION = {
    description: 'Parity action',
    id: 'parity-action',
    label: 'Parity',
    prompt: 'Run parity checks',
    type: 'agent',
}

function file(definition) {
    return { content: JSON.stringify(definition), path: 'actions/parity.json' }
}

export const ACTION_DEFINITION_VALIDATION_PARITY_CASES = [
    {
        expected: { code: 'unknownField', field: null, fieldPath: 'name', index: null },
        files: [file({ ...BASE_DEFINITION, name: 'parity' })],
        name: 'removed name field',
    },
    {
        expected: { code: 'unknownField', field: null, fieldPath: 'needsWorktree', index: null },
        files: [file({ ...BASE_DEFINITION, needsWorktree: true })],
        name: 'unknown top-level field',
    },
    {
        expected: { code: 'missing-field', field: 'label', fieldPath: 'label', index: null },
        files: [file({ ...BASE_DEFINITION, label: '\u00a0\u2003' })],
        name: 'whitespace-only required field',
    },
    {
        expected: { code: 'invalid-regex', field: 'on', fieldPath: 'on[0].condition', index: 0 },
        files: [file({ ...BASE_DEFINITION, on: [{ actionId: 'other', condition: '[' }] })],
        name: 'invalid output-rule regular expression',
    },
    {
        expected: { code: 'agent-required', field: 'model', fieldPath: 'model', index: null },
        files: [file({ ...BASE_DEFINITION, model: 'gpt-5' })],
        name: 'model without agent',
    },
]
