import { describe, expect, it } from 'vitest';
import {
    ActionValidationError,
    loadActionDefinitions,
    sanitizeActionValidationError,
    validateActionDefinition,
} from '../../../../shared/action_definitions.mjs';
import { ACTION_DEFINITION_VALIDATION_PARITY_CASES } from '../../../../shared/action_definition_validation_parity_cases.mjs';
import { BUILTIN_AGENT_PROFILES } from '../../../../shared/agent_profiles.mjs';

// Load and return the thrown ActionValidationError for assertion on its routing metadata.
function validationError(files, dependencies = {}) {
    try {
        loadActionDefinitions(files, dependencies);
    } catch (error) {
        return error;
    }
    throw new Error('Expected a validation error');
}

function file(name, definition) {
    return { content: JSON.stringify(definition), path: `actions/${name}.json` };
}

const IMPLEMENT = {
    description: 'Implement this feature', id: 'action-implement', label: 'Implement',
    prompt: 'use /implement-feature on {{card-file}}', type: 'agent',
};
const LINT = {command: 'npm run lint', description: 'Lint', id: 'action-lint', label: 'Lint', type: 'command'};

describe('loadActionDefinitions', () => {
    it.each(ACTION_DEFINITION_VALIDATION_PARITY_CASES)(
        'matches React validator metadata for $name',
        ({ expected, files }) => {
            expect(validationError(files)).toMatchObject(expected);
        },
    );

    it('parses canonical definitions and resolves shared ID links', () => {
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, onAfter: [LINT.id], phrases: [{ text: '**Run tests**', title: 'Tests' }] }),
            file('lint', LINT),
        ]);
        const implement = actions.find(({ id }) => id === IMPLEMENT.id);
        const lint = actions.find(({ id }) => id === LINT.id);

        expect(implement.onAfter[0]).toBe(lint);
        expect(implement.phrases).toEqual([{ text: '**Run tests**', title: 'Tests' }]);
        expect(implement.sourcePath).toBe('actions/implement.json');
        expect(lint.phrases).toEqual([]);
    });

    it('normalizes agent file-change tracking and rejects invalid uses', () => {
        const tracked = loadActionDefinitions([file('implement', { ...IMPLEMENT, trackFileChanges: true })])
            .find(({ id }) => id === IMPLEMENT.id);
        const untracked = loadActionDefinitions([file('implement', IMPLEMENT)])
            .find(({ id }) => id === IMPLEMENT.id);

        expect(tracked.trackFileChanges).toBe(true);
        expect(untracked.trackFileChanges).toBe(false);
        expect(validationError([file('implement', { ...IMPLEMENT, trackFileChanges: 'yes' })]))
            .toMatchObject({ code: 'invalid-field', field: 'trackFileChanges' });
        expect(validationError([file('lint', { ...LINT, trackFileChanges: true })]))
            .toMatchObject({ code: 'field-not-allowed', field: 'trackFileChanges' });
    });

    it('normalizes streaming and rejects invalid or command-action uses', () => {
        const streaming = loadActionDefinitions([file('implement', { ...IMPLEMENT, streaming: true })])
            .find(({ id }) => id === IMPLEMENT.id);
        const oneShot = loadActionDefinitions([file('implement', IMPLEMENT)])
            .find(({ id }) => id === IMPLEMENT.id);

        expect(streaming.streaming).toBe(true);
        expect(oneShot.streaming).toBe(false);
        expect(validationError([file('implement', { ...IMPLEMENT, streaming: 'yes' })]))
            .toMatchObject({ code: 'invalid-field', field: 'streaming' });
        expect(validationError([file('lint', { ...LINT, streaming: true })]))
            .toMatchObject({ code: 'field-not-allowed', field: 'streaming' });
    });

    it('normalizes command-window visibility and rejects invalid or agent-action uses', () => {
        const visible = loadActionDefinitions([file('lint', { ...LINT, showCommandWindow: true })])
            .find(({ id }) => id === LINT.id);
        const captured = loadActionDefinitions([file('lint', LINT)])
            .find(({ id }) => id === LINT.id);

        expect(visible.showCommandWindow).toBe(true);
        expect(captured.showCommandWindow).toBe(false);
        expect(validationError([file('lint', { ...LINT, showCommandWindow: 'yes' })]))
            .toMatchObject({ code: 'invalid-field', field: 'showCommandWindow' });
        expect(validationError([file('implement', { ...IMPLEMENT, showCommandWindow: true })]))
            .toMatchObject({ code: 'field-not-allowed', field: 'showCommandWindow' });
    });

    it('accepts agent and command diagram actions and validates output strictly', () => {
        const diagramFields = { appliesTo: { kind: 'diagram', type: 'root' }, output: { kind: 'diagram' } };

        expect(() => loadActionDefinitions([
            file('implement', { ...IMPLEMENT, ...diagramFields }),
            file('lint', { ...LINT, ...diagramFields }),
        ])).not.toThrow();
        expect(validationError([file('implement', { ...IMPLEMENT, output: { kind: 'diagram' } })]))
            .toMatchObject({ code: 'diagram-applies-to-required', field: 'output' });
        expect(validationError([file('implement', { ...IMPLEMENT, ...diagramFields, output: { kind: 'image' } })]))
            .toMatchObject({ code: 'invalid-field', field: 'output', fieldPath: 'output.kind' });
        expect(validationError([file('implement', { ...IMPLEMENT, ...diagramFields, output: { kind: 'diagram', format: 'json' } })]))
            .toMatchObject({ code: 'unknownField', field: 'output', fieldPath: 'output.format' });
    });

    it('normalizes strict autoFinish trigger union', () => {
        const autoFinish = { state: 'ready', when: 'card-state' };
        const action = loadActionDefinitions(
            [file('implement', { ...IMPLEMENT, autoFinish, streaming: true })],
            { states: ['design', 'ready'] },
        ).find(({ id }) => id === IMPLEMENT.id);

        expect(action.autoFinish).toEqual(autoFinish);
        expect(loadActionDefinitions([file('implement', { ...IMPLEMENT, streaming: true })])
            .find(({ id }) => id === IMPLEMENT.id).autoFinish).toBeNull();
        expect(validationError([file('implement', { ...IMPLEMENT, autoFinish })]))
            .toMatchObject({ code: 'streaming-required', field: 'autoFinish' });
        expect(validationError([file('lint', { ...LINT, autoFinish })]))
            .toMatchObject({ code: 'field-not-allowed', field: 'autoFinish' });
        expect(validationError([file('implement', { ...IMPLEMENT, autoFinish: { state: '' }, streaming: true })]))
            .toMatchObject({ code: 'invalid-field', field: 'autoFinish', fieldPath: 'autoFinish.when' });
        expect(validationError([file('implement', { ...IMPLEMENT, autoFinish: { state: '', when: 'card-state' }, streaming: true })]))
            .toMatchObject({ code: 'invalid-field', field: 'autoFinish', fieldPath: 'autoFinish.state' });
        expect(validationError([file('implement', { ...IMPLEMENT, autoFinish: { state: 'ready', type: 'card', when: 'card-state' }, streaming: true })]))
            .toMatchObject({ code: 'unknownField', field: 'autoFinish', fieldPath: 'autoFinish.type' });
        expect(() => loadActionDefinitions(
            [file('implement', { ...IMPLEMENT, autoFinish, streaming: true })],
            { states: ['design'] },
        )).toThrow(/Unknown autoFinish state ready/u);
        const diagramAction = {
            ...IMPLEMENT,
            appliesTo: { kind: 'diagram', type: 'root' },
            autoFinish: { when: 'diagram-created' },
            output: { kind: 'diagram' },
            streaming: true,
        };
        expect(loadActionDefinitions([file('diagram', diagramAction)]).find(({ id }) => id === IMPLEMENT.id).autoFinish)
            .toEqual({ when: 'diagram-created' });
        expect(validationError([file('implement', {
            ...IMPLEMENT, autoFinish: { when: 'diagram-created' }, streaming: true,
        })])).toMatchObject({ code: 'diagram-output-required', field: 'autoFinish' });
        expect(validationError([file('diagram', {
            ...diagramAction, autoFinish: { state: 'ready', when: 'diagram-created' },
        })])).toMatchObject({ code: 'field-not-allowed', fieldPath: 'autoFinish.state' });
    });

    it.each([
        ['non-list phrases', { ...IMPLEMENT, phrases: 'nope' }],
        ['non-object phrase', { ...IMPLEMENT, phrases: ['nope'] }],
        ['missing phrase title', { ...IMPLEMENT, phrases: [{ text: 'Run' }] }],
        ['missing phrase text', { ...IMPLEMENT, phrases: [{ title: 'Run' }] }],
        ['unknown phrase field', { ...IMPLEMENT, phrases: [{ label: 'Run', text: 'Run', title: '' }] }],
    ])('rejects %s', (_label, definition) => {
        expect(validationError([file('implement', definition)])).toMatchObject({ field: 'phrases' });
    });

    it('rejects legacy, invalid, unknown, and circular definitions through shared validator', () => {
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, type: 'shell' })])).toThrow(/Invalid action type/u);
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, onBefore: ['missing'] })])).toThrow(/Unknown action id/u);
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, text: 'legacy' })])).toThrow(/Legacy action field text/u);
        expect(() => loadActionDefinitions([file('implement', { ...IMPLEMENT, onBefore: [IMPLEMENT.id] })])).toThrow(/Circular action reference/u);
    });

    it('rejects action ids that collide after log filename normalization', () => {
        const error = validationError([
            file('first', { ...IMPLEMENT, id: 'action.one' }),
            file('second', { ...LINT, id: 'action-one' }),
        ]);

        expect(error).toMatchObject({ code: 'normalized-id-collision', field: 'id', sourcePath: 'actions/second.json' });
        expect(error.message).toContain('collides with action.one');
    });

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
            [{ ...IMPLEMENT, permissionMode: 'ask-for-approval' }, { code: 'agent-required', field: 'permissionMode' }],
            [{ ...IMPLEMENT, thinkingLevel: 'high' }, { code: 'agent-model-required', field: 'thinkingLevel' }],
        ];
        for (const [definition, expected] of cases) {
            const error = validationError([file('implement', definition)]);
            expect(error).toBeInstanceOf(ActionValidationError);
            expect(error).toMatchObject({ ...expected, sourcePath: 'actions/implement.json' });
        }
    });

    it.each([
        ['top-level typo', { ...IMPLEMENT, needsWorktree: true }, { field: null, fieldPath: 'needsWorktree' }],
        ['case-only typo', { ...IMPLEMENT, Label: 'Wrong case' }, { field: null, fieldPath: 'Label' }],
        ['nested on field', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: 'ok', unexpected: true }] }, { field: 'on', fieldPath: 'on[0].unexpected', index: 0 }],
        ['unknown appliesTo field', { ...IMPLEMENT, appliesTo: { audience: 'developers', type: 'feature' } }, { field: 'appliesTo', fieldPath: 'appliesTo.audience' }],
    ])('rejects %s with exact unknown-field metadata', (_label, definition, expected) => {
        const files = definition.on ? [file('implement', definition), file('lint', LINT)] : [file('implement', definition)];
        const error = validationError(files);

        expect(error).toMatchObject({ code: 'unknownField', sourcePath: 'actions/implement.json', ...expected });
    });

    it('rejects own undefined draft fields but ignores inherited properties', () => {
        expect(() => validateActionDefinition({ ...IMPLEMENT, needsWorktree: undefined }, 'actions/draft.json'))
            .toThrow(/Unknown action field needsWorktree/u);

        const definition = Object.assign(Object.create({ needsWorktree: true }), IMPLEMENT);
        expect(() => validateActionDefinition(definition, 'actions/inherited.json')).not.toThrow();
    });

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
            permissionMode: 'ask-for-approval',
            thinkingLevel: 'high',
            trackFileChanges: true,
        };
        const profiles = [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }];

        expect(() => loadActionDefinitions([file('implement', definition), file('lint', LINT)], { profiles })).not.toThrow();
    });

    it('rejects stale and unsupported action permission selections', () => {
        const profiles = [{ command: ['agent'], models: ['model'], name: 'agent' }];
        const permissionError = validationError([
            file('implement', { ...IMPLEMENT, agent: 'agent', permissionMode: 'ask-for-approval' }),
        ], { profiles });

        expect(permissionError).toMatchObject({ code: 'unsupported-permission-mode', field: 'permissionMode' });
        expect(() => loadActionDefinitions(
            [file('implement', { ...IMPLEMENT, agent: 'codex', permissionMode: 'removed' })],
            { profiles: BUILTIN_AGENT_PROFILES },
        )).toThrow('Invalid permission mode');
    });

    it.each(['accessLevel', 'approvalPolicy'])('reports removed %s as an unknown action field', (fieldName) => {
        const error = validationError([file('implement', { ...IMPLEMENT, [fieldName]: 'legacy' })]);

        expect(error).toMatchObject({ code: 'unknownField', fieldPath: fieldName });
    });

    it('keeps list index for unknown ids and invalid regex after reordering rules', () => {
        const unknown = validationError([file('implement', { ...IMPLEMENT, onAfter: [LINT.id, 'missing'] }), file('lint', LINT)]);
        expect(unknown).toMatchObject({ code: 'unknown-action', field: 'onAfter', index: 1 });

        const badRegex = validationError([file('implement', {
            ...IMPLEMENT,
            on: [{ actionId: LINT.id, condition: 'ok' }, { actionId: LINT.id, condition: '(' }],
        }), file('lint', LINT)]);
        expect(badRegex).toMatchObject({ code: 'invalid-regex', field: 'on', index: 1 });
    });

    it.each([
        ['id', { ...IMPLEMENT, id: ' \t\r\n' }],
        ['label', { ...IMPLEMENT, label: ' \t' }],
        ['description', { ...IMPLEMENT, description: '\r\n\u3000' }],
        ['prompt', { ...IMPLEMENT, prompt: ' \t\r\n\u00a0' }],
    ])('rejects ASCII and Unicode whitespace-only %s', (field, definition) => {
        const error = validationError([file('invalid', definition)]);

        expect(error).toMatchObject({ code: 'missing-field', field });
    });

    it.each(['', '\r\n\u2003'])(
        'accepts and preserves incomplete command text %j',
        (command) => {
            const action = loadActionDefinitions([file('lint', { ...LINT, command })])
                .find(({ id }) => id === LINT.id);

            expect(action.command).toBe(command);
        },
    );

    it.each([
        ['missing', undefined],
        ['non-string', 5],
    ])('rejects %s command fields', (_label, command) => {
        const definition = { ...LINT, command };
        if (command === undefined) delete definition.command;
        const error = validationError([file('lint', definition)]);

        expect(error).toMatchObject({ code: 'missing-field', field: 'command' });
    });

    it('rejects surrounding whitespace in action identities and linked ids', () => {
        expect(validationError([file('implement', { ...IMPLEMENT, id: ` ${IMPLEMENT.id}` })]))
            .toMatchObject({ code: 'invalid-field', field: 'id' });
        expect(validationError([
            file('implement', { ...IMPLEMENT, onAfter: [`${LINT.id} `] }),
            file('lint', LINT),
        ])).toMatchObject({ code: 'invalid-field', field: 'onAfter', index: 0 });
        expect(validationError([
            file('implement', { ...IMPLEMENT, on: [{ actionId: ` ${LINT.id}`, condition: 'ok' }] }),
            file('lint', LINT),
        ])).toMatchObject({ code: 'invalid-field', field: 'on', index: 0 });
    });

    it('preserves meaningful executable indentation and accepts an escaped-space regular expression', () => {
        const prompt = '  first line\n\tsecond line';
        const command = '  npm run lint\n\techo done';
        const actions = loadActionDefinitions([
            file('implement', { ...IMPLEMENT, on: [{ actionId: LINT.id, condition: '\\x20' }], prompt }),
            file('lint', { ...LINT, command }),
        ]);

        expect(actions.find(({ id }) => id === IMPLEMENT.id)).toMatchObject({ prompt });
        expect(actions.find(({ id }) => id === LINT.id)).toMatchObject({ command });
    });

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
        ]);

        expect(error).toMatchObject({ code: 'missing-field', field: 'on', index: 1 });
    });

    it('does not route incidental field words embedded in ids/paths', () => {
        // Id embeds `model`, `agent`, and `on`; routing must ignore the text and use the field.
        const error = validationError([file('implement', { ...IMPLEMENT, id: 'model-agent-on', onBefore: ['missing'] })]);
        expect(error).toMatchObject({ code: 'unknown-action', field: 'onBefore', index: 0 });
    });

    it('routes duplicate id from another file and cycles across all three link types', () => {
        const duplicate = validationError([
            file('implement', IMPLEMENT),
            file('clone', { ...LINT, id: IMPLEMENT.id }),
        ]);
        expect(duplicate).toMatchObject({ code: 'duplicate-id', field: 'id', sourcePath: 'actions/clone.json' });

        // a --onBefore--> b --on--> c --onAfter--> a spans onBefore, on, and onAfter.
        const a = { ...IMPLEMENT, id: 'a', onBefore: ['b'] };
        const b = { ...IMPLEMENT, id: 'b', on: [{ actionId: 'c', condition: 'x' }] };
        const c = { ...IMPLEMENT, id: 'c', onAfter: ['a'] };
        const cycle = validationError([file('a', a), file('b', b), file('c', c)]);
        expect(cycle).toMatchObject({ code: 'circular-reference', field: null });
    });

    it('sanitizes validation errors to message-only, logging code and source path', () => {
        const logged = [];
        const error = validationError([file('implement', { ...IMPLEMENT, type: 'shell' })]);
        const safe = sanitizeActionValidationError(error, (line) => logged.push(line));

        expect(safe).not.toBeInstanceOf(ActionValidationError);
        expect(safe.message).toBe(error.message);
        expect(logged[0]).toContain('code=invalid-type');
        expect(logged[0]).toContain('path=actions/implement.json');
    });
});
