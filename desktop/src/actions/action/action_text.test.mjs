import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { prepareAgentPrompt, resolveAgentPrompt, resolvePlaceholders } = require('./action_text');

const project = { rootPath: 'C:/repo' };
const worktreeProject = { rootPath: 'C:/worktrees/2' };
const releasesFolder = 'design/releases';

describe('resolvePlaceholders', () => {
    it('resolves primary and linked-worktree folder placeholders with card values', () => {
        const context = { file: 'design/card.md', title: 'Placeholder support' };

        expect(resolvePlaceholders(
            '{{worktree-folder}} {{project-folder}} {{releases-folder}} {{card-file}} {{card-title}} {{card-prompt}}',
            context,
            worktreeProject,
            project,
            releasesFolder,
            'focus',
        )).toBe(`C:/worktrees/2 C:/repo ${path.resolve('C:/repo', releasesFolder)} design/card.md Placeholder support focus`);
    });

    it('rejects missing required folder values before process start', () => {
        expect(() => resolvePlaceholders('{{worktree-folder}}', {}, {}, project, releasesFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{project-folder}}', {}, project, {}, releasesFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{releases-folder}}', {}, project, project, '', '')).toThrow('configured releases folder');
    });

    it('rejects card-file placeholder without file context', () => {
        expect(() => resolvePlaceholders('{{card-file}}', { kind: 'project' }, project, project, releasesFolder, '')).toThrow('Cannot resolve card-file placeholder');
    });

    it('rejects card-title placeholder without card title', () => {
        expect(() => resolvePlaceholders('{{card-title}}', { kind: 'card' }, project, project, releasesFolder, '')).toThrow('Cannot resolve card-title placeholder');
    });

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', { file: 'design/card.md' }, project, project, releasesFolder, 'focus'))
            .toBe('{{rootProjectFolder}} {{file}} {{prompt}}');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces card-prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{card-prompt}}' }, {}, project, project, releasesFolder, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, releasesFolder, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, releasesFolder, '  ')).toBe('Review');
    });
});

describe('prepareAgentPrompt', () => {
    it('includes resolved placeholders and tracked-file instruction', () => {
        const action = { prompt: 'Review {{card-file}} in {{worktree-folder}}', trackFileChanges: true };

        expect(prepareAgentPrompt(action, { file: 'design/card.md' }, project, project, releasesFolder)).toBe(
            'Review design/card.md in C:/repo\n\nDo not stage or commit changes. md2 will commit files captured from provider edit tools.',
        );
    });

    it('prepares the custom-prompt action as empty', () => {
        expect(prepareAgentPrompt({ prompt: '{{card-prompt}}' }, {}, project, project, releasesFolder)).toBe('');
    });
});
