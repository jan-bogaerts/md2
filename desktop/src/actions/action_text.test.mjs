import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAgentPrompt, resolvePlaceholders } = require('./action_text');

const project = { rootPath: 'C:/repo' };

describe('resolvePlaceholders', () => {
    it('resolves project, file, and prompt placeholders', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', { file: 'design/card.md' }, project, 'focus'))
            .toBe('C:/repo design/card.md focus');
    });

    it('rejects missing project root', () => {
        expect(() => resolvePlaceholders('{{rootProjectFolder}}', {}, {}, '')).toThrow('Missing local Git project rootPath');
    });

    it('rejects file placeholder without file context', () => {
        expect(() => resolvePlaceholders('{{file}}', { kind: 'project' }, project, '')).toThrow('Cannot resolve file placeholder');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{prompt}}' }, {}, project, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, '  ')).toBe('Review');
    });
});
