import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAgentPrompt, resolvePlaceholders } = require('./action_text');

const project = { rootPath: 'C:/repo' };

describe('resolvePlaceholders', () => {
    it('resolves project, card file, and card prompt placeholders', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{card-file}} {{card-prompt}}', { file: 'design/card.md' }, project, 'focus'))
            .toBe('C:/repo design/card.md focus');
    });

    it('rejects missing project root', () => {
        expect(() => resolvePlaceholders('{{rootProjectFolder}}', {}, {}, '')).toThrow('Missing local Git project rootPath');
    });

    it('rejects card-file placeholder without file context', () => {
        expect(() => resolvePlaceholders('{{card-file}}', { kind: 'project' }, project, '')).toThrow('Cannot resolve card-file placeholder');
    });

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{file}} {{prompt}}', { file: 'design/card.md' }, project, 'focus')).toBe('{{file}} {{prompt}}');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces card-prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{card-prompt}}' }, {}, project, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, '  ')).toBe('Review');
    });
});
