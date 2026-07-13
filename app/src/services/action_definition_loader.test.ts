import { describe, expect, it } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID, CUSTOM_PROMPT_ACTION_NAME, type ActionFile } from '../data/action_types'
import { loadActionDefinitions } from './action_definition_loader'

function file(name: string, definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${name}.json` }
}

const IMPLEMENT = {
    description: 'Implement this feature',
    id: 'action-implement',
    label: 'Implement',
    name: 'implement',
    prompt: 'use /implement-feature on {{file}}',
    type: 'agent',
}

const LINT = {
    command: 'npm run lint',
    description: 'Lint',
    id: 'action-lint',
    label: 'Lint',
    name: 'lint',
    type: 'command',
}

describe('loadActionDefinitions', () => {
    it('parses canonical fields, source metadata, and optional values', () => {
        const actions = loadActionDefinitions([file('implement', {
            ...IMPLEMENT,
            agent: 'codex',
            appliesTo: { state: 'design', type: 'feature' },
            icon: 'icon.svg',
            model: 'gpt-5',
            needsWorkTree: true,
            onState: 'implementing',
            thinkingLevel: 'high',
        })], { profiles: [{ command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }] })
        const implement = actions.find(({ id }) => id === IMPLEMENT.id)

        expect(implement).toMatchObject({
            agent: 'codex', appliesTo: { state: 'design', type: 'feature' }, builtin: false,
            icon: 'icon.svg', model: 'gpt-5', needsWorkTree: true, onState: 'implementing',
            sourcePath: 'actions/implement.json', thinkingLevel: 'high', type: 'agent',
        })
    })

    it('always includes reserved built-in custom prompt action', () => {
        const builtin = loadActionDefinitions([]).find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)

        expect(builtin).toMatchObject({ builtin: true, name: CUSTOM_PROMPT_ACTION_NAME, sourcePath: null, type: 'agent' })
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

    it('rejects duplicate IDs and names, including built-in reservations', () => {
        expect(() => loadActionDefinitions([file('a', IMPLEMENT), file('b', { ...LINT, id: IMPLEMENT.id })])).toThrow(/Duplicate action id/u)
        expect(() => loadActionDefinitions([file('a', IMPLEMENT), file('b', { ...LINT, name: IMPLEMENT.name })])).toThrow(/Duplicate action name/u)
        expect(() => loadActionDefinitions([file('a', { ...IMPLEMENT, id: CUSTOM_PROMPT_ACTION_ID })])).toThrow(/Duplicate action id/u)
        expect(() => loadActionDefinitions([file('a', { ...IMPLEMENT, name: CUSTOM_PROMPT_ACTION_NAME })])).toThrow(/Duplicate action name/u)
    })

    it('rejects invalid agent, model, and thinking-level combinations', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, model: 'gpt-5' })])).toThrow(/model requires agent/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, agent: 'codex', model: 'bad' })], {profiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }]})).toThrow(/Unknown model/u)
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, agent: 'codex', thinkingLevel: 'high' })], {profiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }]})).toThrow(/thinkingLevel requires agent and model/u)
    })

    it('loads an action whose agent profile is no longer configured', () => {
        const actions = loadActionDefinitions([file('implement', {
            ...IMPLEMENT,
            agent: 'missing',
            model: 'removed-model',
            thinkingLevel: 'high',
        })], { profiles: [] })

        expect(actions.find(({ id }) => id === IMPLEMENT.id)).toMatchObject({ agent: 'missing', model: 'removed-model', thinkingLevel: 'high' })
    })

    it('detects self references and circular ID chains', () => {
        expect(() => loadActionDefinitions([file('a', { ...IMPLEMENT, onBefore: [IMPLEMENT.id] })])).toThrow(/Circular action reference/u)
        expect(() => loadActionDefinitions([
            file('a', { ...IMPLEMENT, onBefore: [LINT.id] }),
            file('b', { ...LINT, onAfter: [IMPLEMENT.id] }),
        ])).toThrow(/Circular action reference/u)
    })
})
