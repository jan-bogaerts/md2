import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validatePreparePromptRequest, validateStartRequest } = require('./action_run_request');

describe('validateStartRequest', () => {
    it.each(['card', 'file', 'folder', 'project'])('accepts %s context and defaults extraPrompt', (kind) => {
        expect(validateStartRequest({ actionId: 'main', context: { kind } })).toEqual({
            actionId: 'main',
            context: { kind },
            runInput: { accessLevel: undefined, agent: undefined, approvalPolicy: undefined, continueFrom: undefined, extraPrompt: '', model: undefined, thinkingLevel: undefined },
        });
    });

    it.each([
        [{ actionId: 'main', command: 'whoami', context: { kind: 'project' } }, 'Unsupported action start field: command'],
        [null, 'Missing action start request'],
        [{ context: { kind: 'project' } }, 'Missing actionId'],
        [{ actionId: '', context: { kind: 'project' } }, 'Missing actionId'],
        [{ actionId: 'main' }, 'Missing action context'],
        [{ actionId: 'main', context: { kind: 'unknown' } }, 'Invalid action context kind'],
        [{ actionId: 'main', context: { file: 1, kind: 'file' } }, 'Invalid action context field file'],
        [{ actionId: 'main', context: { kind: 'project' }, runInput: null }, 'Invalid action runInput'],
        [{ actionId: 'main', context: { kind: 'project' }, runInput: { model: 1 } }, 'Invalid action run input model'],
    ])('rejects invalid request %#', (request, message) => {
        expect(() => validateStartRequest(request)).toThrow(message);
    });

    it('preserves accepted optional strings', () => {
        const runInput = { accessLevel: 'workspace-write', agent: 'codex', approvalPolicy: 'on-request', continueFrom: 'log.json', extraPrompt: 'next', model: 'gpt', prompt: '', thinkingLevel: 'high' };

        expect(validateStartRequest({ actionId: 'main', context: { kind: 'project' }, runInput }).runInput).toEqual(runInput);
    });

    it.each(['accessLevel', 'agent', 'approvalPolicy', 'continueFrom', 'extraPrompt', 'model', 'prompt', 'thinkingLevel'])('rejects non-string %s', (fieldName) => {
        const request = { actionId: 'main', context: { kind: 'project' }, runInput: { [fieldName]: 1 } };

        expect(() => validateStartRequest(request)).toThrow(`Invalid action run input ${fieldName}`);
    });

    it('distinguishes absent prompt from an empty prompt override', () => {
        const withoutPrompt = validateStartRequest({ actionId: 'main', context: { kind: 'project' }, runInput: {} });
        const withEmptyPrompt = validateStartRequest({ actionId: 'main', context: { kind: 'project' }, runInput: { prompt: '' } });

        expect(withoutPrompt.runInput).not.toHaveProperty('prompt');
        expect(withEmptyPrompt.runInput).toHaveProperty('prompt', '');
    });
});

describe('validatePreparePromptRequest', () => {
    it('accepts only an action id and validated context', () => {
        expect(validatePreparePromptRequest({ actionId: 'main', context: { file: 'design/F-1.md', kind: 'card' } }))
            .toEqual({ actionId: 'main', context: { file: 'design/F-1.md', kind: 'card' } });
    });

    it('rejects renderer-owned prompt data', () => {
        expect(() => validatePreparePromptRequest({ actionId: 'main', context: { kind: 'project' }, prompt: 'renderer copy' }))
            .toThrow('Unsupported action prompt field: prompt');
    });
});
