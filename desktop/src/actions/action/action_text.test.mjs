import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAgentPrompt, resolvePlaceholders } = require('./action_text');

const project = { rootPath: 'C:/repo' };
const worktreeProject = { rootPath: 'C:/worktrees/2' };
const projectFolder = 'design';
const releasesFolder = 'design/releases';
const activeCardsFolder = 'design/feature_descriptions';

describe('resolvePlaceholders', () => {
    it('resolves primary and linked-worktree folder placeholders with card values', () => {
        const context = { file: 'design/card.md', title: 'Placeholder support' };

        expect(resolvePlaceholders(
            '{{active-cards-folder}} {{worktree-folder}} {{repository-folder}} {{project-folder}} {{releases-folder}} {{card-file}} {{ this-card }} {{card-title}} {{card-prompt}}',
            context,
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            activeCardsFolder,
            'focus',
        )).toBe(`${path.resolve('C:/repo', activeCardsFolder)} C:/worktrees/2 C:/repo ${path.resolve('C:/repo', projectFolder)} ${path.resolve('C:/repo', releasesFolder)} design/card.md design/card.md Placeholder support focus`);
    });

    it('resolves empty project folder to the opened repository', () => {
        expect(resolvePlaceholders(
            '{{repository-folder}} {{project-folder}}',
            {},
            worktreeProject,
            project,
            '',
            releasesFolder,
            'active',
            '',
        )).toBe('C:/repo C:/repo');
    });

    it('rejects missing required folder values before process start', () => {
        expect(() => resolvePlaceholders('{{worktree-folder}}', {}, {}, project, projectFolder, releasesFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{repository-folder}}', {}, project, {}, projectFolder, releasesFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{project-folder}}', {}, project, project, undefined, releasesFolder, activeCardsFolder, '')).toThrow('configured project folder');
        expect(() => resolvePlaceholders('{{releases-folder}}', {}, project, project, projectFolder, '', activeCardsFolder, '')).toThrow('configured releases folder');
        expect(() => resolvePlaceholders('{{active-cards-folder}}', {}, project, project, projectFolder, releasesFolder, '', '')).toThrow('configured working folder');
        expect(() => resolvePlaceholders('{{active-cards-folder}}', {}, project, {}, projectFolder, releasesFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
    });

    it.each(['card-file', 'this-card'])('rejects %s placeholder without file context', (placeholderName) => {
        expect(() => resolvePlaceholders(`{{${placeholderName}}}`, { kind: 'project' }, project, project, projectFolder, releasesFolder, activeCardsFolder, ''))
            .toThrow(`Cannot resolve ${placeholderName} placeholder without a file context`);
    });

    it('rejects card-title placeholder without card title', () => {
        expect(() => resolvePlaceholders('{{card-title}}', { kind: 'card' }, project, project, projectFolder, releasesFolder, activeCardsFolder, '')).toThrow('Cannot resolve card-title placeholder');
    });

    it('resolves merge conflict placeholders', () => {
        const context = { conflictFile: 'src/one.js', conflictFiles: 'src/one.js\nsrc/two.js', kind: 'merge-conflict' };

        expect(resolvePlaceholders(
            '{{conflict-file}}\n{{conflict-files}}',
            context,
            project,
            project,
            projectFolder,
            releasesFolder,
            activeCardsFolder,
            '',
        )).toBe('src/one.js\nsrc/one.js\nsrc/two.js');
    });

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', { file: 'design/card.md' }, project, project, projectFolder, releasesFolder, activeCardsFolder, 'focus'))
            .toBe('{{rootProjectFolder}} {{file}} {{prompt}}');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces card-prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder, activeCardsFolder, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, activeCardsFolder, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, activeCardsFolder, '  ')).toBe('Review');
    });

    it('resolves an empty custom prompt', () => {
        expect(resolveAgentPrompt({ prompt: '{{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder, activeCardsFolder, '')).toBe('');
    });
});
