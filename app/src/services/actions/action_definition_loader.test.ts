import { describe, expect, it, vi } from 'vitest'
import { ActionValidationError } from '../../../../shared/action_definitions.mjs'
import { ACTION_DEFINITION_VALIDATION_PARITY_CASES } from '../../../../shared/action_definition_validation_parity_cases.mjs'
import {
    CUSTOM_PROMPT_ACTION_ID,
    type ActionDefinitionEntry,
    type ActionFile,
} from '../../data/action_types'
import { loadActionDefinitions, loadTolerantActionDefinitionGraph, validateActionDefinitionGraph } from './action_definition_loader'

function file(name: string, definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${name}.json` }
}

const IMPLEMENT = {
    description: 'Implement this feature',
    id: 'action-implement',
    label: 'Implement',
    prompt: 'use /implement-feature on {{card-file}}',
    type: 'agent',
}

const LINT = {
    command: 'npm run lint',
    description: 'Lint',
    id: 'action-lint',
    label: 'Lint',
    type: 'command',
}

function validationError(files: ActionFile[]): ActionValidationError {
    try {
        loadActionDefinitions(files)
    } catch (error) {
        if (error instanceof ActionValidationError) return error
        throw error
    }
    throw new Error('Expected action validation error')
}

describe('loadActionDefinitions', () => {
    it.each(ACTION_DEFINITION_VALIDATION_PARITY_CASES)(
        'matches Electron validator metadata for $name',
        ({ expected, files }) => {
            expect(validationError(files)).toMatchObject(expected)
        },
    )

    it('parses each file exactly once at the loading boundary', () => {
        const files = [file('implement', IMPLEMENT), file('lint', LINT)]
        const parse = vi.spyOn(JSON, 'parse')

        loadActionDefinitions(files)

        expect(parse).toHaveBeenCalledTimes(files.length)
        parse.mockRestore()
    })

    it('validates structured whole-project graphs without JSON round-tripping', () => {
        const definitions: ActionDefinitionEntry[] = [
            { definition: { ...IMPLEMENT, onAfter: [LINT.id] }, path: 'actions/implement.json' },
            { definition: LINT, path: 'actions/lint.json' },
        ]
        const parse = vi.spyOn(JSON, 'parse')
        const stringify = vi.spyOn(JSON, 'stringify')

        const actions = validateActionDefinitionGraph(definitions)

        expect(actions.find(({ id }) => id === IMPLEMENT.id)?.onAfter[0].id).toBe(LINT.id)
        expect(parse).not.toHaveBeenCalled()
        expect(stringify).not.toHaveBeenCalled()
        parse.mockRestore()
        stringify.mockRestore()
    })

    it('parses canonical fields, source metadata, and optional values', () => {
        const actions = loadActionDefinitions([file('implement', {
            ...IMPLEMENT,
            agent: 'codex',
            appliesTo: { state: 'design', type: 'feature' },
            icon: 'icon.svg',
            model: 'gpt-5',
            needsWorkTree: true,
            onState: 'implementing',
            phrases: [{ text: '**Run tests**', title: 'Tests' }, { text: 'Show diff', title: '' }],
            thinkingLevel: 'high',
        })], { profiles: [{ command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' }] })
        const implement = actions.find(({ id }) => id === IMPLEMENT.id)

        expect(implement).toMatchObject({
            agent: 'codex', appliesTo: { state: 'design', type: 'feature' }, builtin: false,
            icon: 'icon.svg', model: 'gpt-5', needsWorkTree: true, onState: 'implementing',
            phrases: [{ text: '**Run tests**', title: 'Tests' }, { text: 'Show diff', title: '' }],
            sourcePath: 'actions/implement.json', thinkingLevel: 'high', type: 'agent',
        })
    })

    it('defaults missing phrases to an empty list', () => {
        const implement = loadActionDefinitions([file('implement', IMPLEMENT)]).find(({ id }) => id === IMPLEMENT.id)

        expect(implement?.phrases).toEqual([])
    })

    it.each([
        ['non-list phrases', { ...IMPLEMENT, phrases: 'nope' }, { field: 'phrases', index: null }],
        ['non-object phrase', { ...IMPLEMENT, phrases: ['nope'] }, { field: 'phrases', index: 0 }],
        ['missing phrase title', { ...IMPLEMENT, phrases: [{ text: 'Run' }] }, { field: 'phrases', index: 0 }],
        ['missing phrase text', { ...IMPLEMENT, phrases: [{ title: 'Run' }] }, { field: 'phrases', index: 0 }],
        ['unknown phrase field', { ...IMPLEMENT, phrases: [{ label: 'Run', text: 'Run', title: '' }] }, { field: 'phrases', index: 0 }],
    ])('rejects %s', (_label, definition, expected) => {
        expect(validationError([file('implement', definition)])).toMatchObject(expected)
    })

    it('always includes reserved built-in custom prompt action', () => {
        const builtin = loadActionDefinitions([]).find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)

        expect(builtin).toMatchObject({ builtin: true, phrases: [], sourcePath: null, type: 'agent' })
    })

    it.each([
        [{ ...IMPLEMENT, needsWorktree: true }, { field: null, fieldPath: 'needsWorktree' }],
        [{ ...IMPLEMENT, on: [{ actionId: LINT.id, condition: 'done', actionID: LINT.id }] }, { field: 'on', fieldPath: 'on[0].actionID', index: 0 }],
        [{ ...IMPLEMENT, appliesTo: { Type: 'feature', type: 'feature' } }, { field: 'appliesTo', fieldPath: 'appliesTo.Type' }],
    ])('rejects unknown fields during React loading', (definition, expected) => {
        const files = 'on' in definition ? [file('implement', definition), file('lint', LINT)] : [file('implement', definition)]

        expect(validationError(files)).toMatchObject({code: 'unknownField', sourcePath: 'actions/implement.json', ...expected})
    })

    it('resolves ID links and regular-expression rules to shared definitions', () => {
        const actions = loadActionDefinitions([
            file('lint', LINT),
            file('implement', {
                ...IMPLEMENT,
                on: [{ actionId: LINT.id, condition: 'error' }],
                onAfter: [LINT.id],
                onBefore: [LINT.id],
            }),
        ])
        const implement = actions.find(({ id }) => id === IMPLEMENT.id)
        const lint = actions.find(({ id }) => id === LINT.id)

        expect(implement?.onBefore[0]).toBe(lint)
        expect(implement?.on[0]).toMatchObject({ action: lint, actionId: LINT.id, condition: 'error' })
        expect(implement?.onAfter[0]).toBe(lint)
    })

    it.each([
        ['invalid json', [{ content: '{ not json', path: 'actions/bad.json' }], /Invalid action json/u],
        ['missing id', [file('implement', { ...IMPLEMENT, id: undefined })], /field id/u],
        ['missing prompt', [file('implement', { ...IMPLEMENT, prompt: undefined })], /field prompt/u],
        ['invalid type', [file('implement', { ...IMPLEMENT, type: 'shell' })], /Invalid action type/u],
        ['unknown id', [file('implement', { ...IMPLEMENT, onBefore: ['missing'] })], /Unknown action id/u],
        ['invalid regexp', [file('implement', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: '[' }] })], /Invalid regular expression/u],
        ['legacy field', [file('implement', { ...IMPLEMENT, text: 'legacy' })], /Legacy action field text/u],
        ['legacy type', [file('lint', { ...LINT, type: 'cmd' })], /Legacy action type cmd/u],
        ['array file', [file('implement', [IMPLEMENT])], /one definition/u],
    ])('rejects %s', (_label, files, expected) => {
        expect(() => loadActionDefinitions(files as ActionFile[])).toThrow(expected as RegExp)
    })

    it('rejects duplicate IDs, including built-in reservations', () => {
        expect(() => loadActionDefinitions([file('a', IMPLEMENT), file('b', { ...LINT, id: IMPLEMENT.id })])).toThrow(/Duplicate action id/u)
        expect(() => loadActionDefinitions([file('a', { ...IMPLEMENT, id: CUSTOM_PROMPT_ACTION_ID })])).toThrow(/Duplicate action id/u)
    })

    it('rejects action IDs that collide after normalization', () => {
        expect(() => loadActionDefinitions([
            file('a', { ...IMPLEMENT, id: 'action.one' }),
            file('b', { ...LINT, id: 'action_one' }),
        ])).toThrow(/collides with action\.one after normalization/u)
    })

    it('rejects invalid agent, model, and thinking-level combinations', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, model: 'gpt-5' })])).toThrow(/model requires agent/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, agent: 'codex', model: 'bad' })], {profiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }]})).toThrow(/Unknown model/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, agent: 'codex', thinkingLevel: 'high' })], {profiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }]})).toThrow(/thinkingLevel requires agent and model/u)
        expect(() => loadActionDefinitions([file('implement', {...IMPLEMENT, agent: 'codex', model: 'gpt-5', thinkingLevel: 'extreme'})], {profiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }]})).toThrow(/Invalid thinking level/u)
    })

    it('rejects empty and malformed configured model lists', () => {
        const definition = file('implement', { ...IMPLEMENT, agent: 'custom', model: 'model-a' })

        expect(() => loadActionDefinitions([definition], {profiles: [{ command: ['custom'], models: [], name: 'custom' }]})).toThrow(/Invalid model list/u)
        expect(() => loadActionDefinitions([definition], {profiles: [{ command: ['custom'], models: 'model-a' as unknown as string[], name: 'custom' }]})).toThrow(/Invalid model list/u)
    })

    it('loads retired selections when capability validation is disabled for editing', () => {
        const actions = loadActionDefinitions([file('implement', {
            ...IMPLEMENT,
            agent: 'missing',
            model: 'removed-model',
            thinkingLevel: 'extreme',
        })], { profiles: [], validateAgentCapabilities: false })

        expect(actions.find(({ id }) => id === IMPLEMENT.id)).toMatchObject({ agent: 'missing', model: 'removed-model', thinkingLevel: 'extreme' })
    })

    it('matches shared whitespace validation while preserving meaningful executable whitespace', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, label: '\u00a0\u2003' })]))
            .toThrow(/field label/u)
        expect(() => loadActionDefinitions([
            file('implement', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: '\r\n\u3000' }] }),
            file('lint', LINT),
        ])).toThrow(/field on\[0\]\.condition/u)

        const prompt = '  first line\n\tsecond line'
        const command = '  npm run lint\n\techo done'
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: '\\x20' }], prompt }),
            file('lint', { ...LINT, command }),
        ])

        expect(actions.find(({ id }) => id === IMPLEMENT.id)?.prompt).toBe(prompt)
        expect(actions.find(({ id }) => id === LINT.id)?.command).toBe(command)
    })

    it('detects self references and circular ID chains', () => {
        expect(() => loadActionDefinitions([file('a', { ...IMPLEMENT, onBefore: [IMPLEMENT.id] })])).toThrow(/Circular action reference/u)
        expect(() => loadActionDefinitions([
            file('a', { ...IMPLEMENT, onBefore: [LINT.id] }),
            file('b', { ...LINT, onAfter: [IMPLEMENT.id] }),
        ])).toThrow(/Circular action reference/u)
    })
})

describe('loadTolerantActionDefinitionGraph', () => {
    it('silently drops unknown fields at every supported object level', () => {
        const result = loadTolerantActionDefinitionGraph([file('implement', {
            ...IMPLEMENT,
            appliesTo: { state: 'design', unknown: 'ignored' },
            name: 'Legacy display name',
            phrases: [{ extra: true, text: 'Run', title: '' }],
        })])
        const action = result.actions.find(({ id }) => id === IMPLEMENT.id)
        const definition = result.definitions[0].definition as unknown as Record<string, unknown>

        expect(action).toMatchObject({ appliesTo: { state: 'design' }, phrases: [{ text: 'Run', title: '' }] })
        expect(definition).not.toHaveProperty('name')
        expect(result.issues).toEqual([])
    })

    it('defaults missing required fields and reports every replacement', () => {
        const result = loadTolerantActionDefinitionGraph([file('repair', { command: 'npm test' })])
        const action = result.actions.find(({ sourcePath }) => sourcePath === 'actions/repair.json')

        expect(action).toMatchObject({
            command: 'npm test',
            description: 'No description provided.',
            id: 'action-actions-repair',
            label: 'repair',
            type: 'command',
        })
        expect(result.issues.map(({ message }) => message)).toEqual(expect.arrayContaining([
            expect.stringContaining('Missing id'),
            expect.stringContaining('Missing label'),
            expect.stringContaining('Missing description'),
            expect.stringContaining('Missing type'),
        ]))
    })

    it('loads valid actions when another file is invalid and drops unavailable links', () => {
        const result = loadTolerantActionDefinitionGraph([
            file('implement', { ...IMPLEMENT, onBefore: ['action-bad'] }),
            file('bad', { ...LINT, id: 'action-bad', type: 'invalid' }),
            file('lint', LINT),
        ])
        const implement = result.actions.find(({ id }) => id === IMPLEMENT.id)

        expect(result.actions.map(({ id }) => id)).toContain(LINT.id)
        expect(implement?.onBefore).toEqual([])
        expect(result.issues.map(({ message }) => message).join('\n')).toContain('Invalid action type')
        expect(result.issues.map(({ message }) => message).join('\n')).toContain('dropping link')
    })
})
