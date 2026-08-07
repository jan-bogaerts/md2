import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { prepareAgentPrompt, resolveAgentPrompt, resolvePlaceholders } = require('./action_text');

const project = { rootPath: 'C:/repo' };
const worktreeProject = { rootPath: 'C:/worktrees/2' };
const projectFolder = 'design';
const releasesFolder = 'design/releases';

describe('resolvePlaceholders', () => {
    it('resolves primary and linked-worktree folder placeholders with card values', () => {
        const context = { file: 'design/card.md', title: 'Placeholder support' };

        expect(resolvePlaceholders(
            '{{worktree-folder}} {{repository-folder}} {{project-folder}} {{releases-folder}} {{card-file}} {{ this-card }} {{card-title}} {{card-prompt}}',
            context,
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            'focus',
        )).toBe(`C:/worktrees/2 C:/repo ${path.resolve('C:/repo', projectFolder)} ${path.resolve('C:/repo', releasesFolder)} design/card.md design/card.md Placeholder support focus`);
    });

    it('resolves empty project folder to the opened repository', () => {
        expect(resolvePlaceholders(
            '{{repository-folder}} {{project-folder}}',
            {},
            worktreeProject,
            project,
            '',
            releasesFolder,
            '',
        )).toBe('C:/repo C:/repo');
    });

    it('rejects missing required folder values before process start', () => {
        expect(() => resolvePlaceholders('{{worktree-folder}}', {}, {}, project, projectFolder, releasesFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{repository-folder}}', {}, project, {}, projectFolder, releasesFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{project-folder}}', {}, project, project, undefined, releasesFolder, '')).toThrow('configured project folder');
        expect(() => resolvePlaceholders('{{releases-folder}}', {}, project, project, projectFolder, '', '')).toThrow('configured releases folder');
    });

    it.each(['card-file', 'this-card'])('rejects %s placeholder without file context', (placeholderName) => {
        expect(() => resolvePlaceholders(`{{${placeholderName}}}`, { kind: 'project' }, project, project, projectFolder, releasesFolder, ''))
            .toThrow(`Cannot resolve ${placeholderName} placeholder without a file context`);
    });

    it('rejects card-title placeholder without card title', () => {
        expect(() => resolvePlaceholders('{{card-title}}', { kind: 'card' }, project, project, projectFolder, releasesFolder, '')).toThrow('Cannot resolve card-title placeholder');
    });

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', { file: 'design/card.md' }, project, project, projectFolder, releasesFolder, 'focus'))
            .toBe('{{rootProjectFolder}} {{file}} {{prompt}}');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces card-prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, '  ')).toBe('Review');
    });
});

describe('prepareAgentPrompt', () => {
    it('includes resolved placeholders and tracked-file instruction', () => {
        const action = { prompt: 'Review {{card-file}} and {{this-card}} in {{worktree-folder}}', trackFileChanges: true };

        expect(prepareAgentPrompt(action, { file: 'design/card.md' }, project, project, projectFolder, releasesFolder)).toBe(
            'Review design/card.md and design/card.md in C:/repo\n\nDo not stage or commit changes. md2 will commit files captured from provider edit tools.',
        );
    });

    it('prepares the custom-prompt action as empty', () => {
        expect(prepareAgentPrompt({ prompt: '{{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder)).toBe('');
    });
});
