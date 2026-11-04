import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAgentPrompt, resolvePlaceholders, resolvePopupPrompt } = require('./action_text');

const project = { rootPath: 'C:/repo' };
const worktreeProject = { rootPath: 'C:/worktrees/2' };
const projectFolder = 'design';
const releasesFolder = 'design/releases';
const actionsFolder = 'design/actions';
const activeCardsFolder = 'design/feature_descriptions';

describe('resolvePlaceholders', () => {
    it('substitutes every version and rejects a missing value', () => {
        expect(resolvePlaceholders('{{version}} and {{ version }}', {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '', null, 'beta 1'))
            .toBe('beta 1 and beta 1');
        expect(() => resolvePlaceholders('{{version}}', {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '', null))
            .toThrow('Cannot resolve version placeholder without a version');
    });
    it('resolves primary and linked-worktree folder placeholders with card values', () => {
        const context = { file: 'design/card.md', title: 'Placeholder support' };

        expect(resolvePlaceholders(
            '{{active-cards-folder}} {{worktree-folder}} {{repository-folder}} {{project-folder}} {{releases-folder}} {{actions-folder}} {{card-file}} {{ this-card }} {{card-title}} {{card-prompt}}',
            context,
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
            'focus',
        )).toBe(`${path.resolve('C:/repo', activeCardsFolder)} C:/worktrees/2 C:/repo ${path.resolve('C:/repo', projectFolder)} ${path.resolve('C:/repo', releasesFolder)} ${path.resolve('C:/repo', actionsFolder)} design/card.md design/card.md Placeholder support focus`);
    });

    it('resolves actions-folder under the opened repository with and without a project folder', () => {
        expect(resolvePlaceholders('{{actions-folder}}', {}, worktreeProject, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, ''))
            .toBe(path.resolve('C:/repo', 'design/actions'));
        expect(resolvePlaceholders('{{ actions-folder }}', {}, worktreeProject, project, '', 'releases', 'actions', 'active', ''))
            .toBe(path.resolve('C:/repo', 'actions'));
    });

    it('resolves empty project folder to the opened repository', () => {
        expect(resolvePlaceholders(
            '{{repository-folder}} {{project-folder}}',
            {},
            worktreeProject,
            project,
            '',
            releasesFolder,
            actionsFolder,
            'active',
            '',
        )).toBe('C:/repo C:/repo');
    });

    it('rejects missing required folder values before process start', () => {
        expect(() => resolvePlaceholders('{{worktree-folder}}', {}, {}, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{repository-folder}}', {}, project, {}, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
        expect(() => resolvePlaceholders('{{project-folder}}', {}, project, project, undefined, releasesFolder, actionsFolder, activeCardsFolder, '')).toThrow('configured project folder');
        expect(() => resolvePlaceholders('{{releases-folder}}', {}, project, project, projectFolder, '', actionsFolder, activeCardsFolder, '')).toThrow('configured releases folder');
        expect(() => resolvePlaceholders('{{actions-folder}}', {}, project, project, projectFolder, releasesFolder, '', activeCardsFolder, '')).toThrow('Cannot resolve actions-folder placeholder without a configured actions folder');
        expect(() => resolvePlaceholders('{{active-cards-folder}}', {}, project, project, projectFolder, releasesFolder, actionsFolder, '', '')).toThrow('configured working folder');
        expect(() => resolvePlaceholders('{{active-cards-folder}}', {}, project, {}, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '')).toThrow('Missing local Git project rootPath');
    });

    it.each(['card-file', 'this-card'])('rejects %s placeholder without file context', (placeholderName) => {
        expect(() => resolvePlaceholders(`{{${placeholderName}}}`, { kind: 'project' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, ''))
            .toThrow(`Cannot resolve ${placeholderName} placeholder without a file context`);
    });

    it('rejects card-title placeholder without card title', () => {
        expect(() => resolvePlaceholders('{{card-title}}', { kind: 'card' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '')).toThrow('Cannot resolve card-title placeholder');
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
            actionsFolder,
            activeCardsFolder,
            '',
        )).toBe('src/one.js\nsrc/one.js\nsrc/two.js');
    });

    it('resolves diagram-file only for diagram context', () => {
        const diagramFile = 'C:\\worktrees\\2\\design\\diagrams\\Overview.json';

        expect(resolvePlaceholders(
            'Save {{diagram-file}}',
            { kind: 'diagram', type: 'root' },
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
            '',
            diagramFile,
        )).toBe(`Save ${diagramFile}`);
        expect(() => resolvePlaceholders(
            '{{diagram-file}}',
            { kind: 'project' },
            project,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
            '',
            diagramFile,
        )).toThrow('outside diagram context');
    });

    it('resolves exact reviewed diagram changes only with diagram identity', () => {
        const reviewedText = '- Rename "Orders" to "Purchases".\n- Add connection.';
        const context = { diagramChanges: reviewedText, diagramId: 'diagram-1', kind: 'diagram', type: 'root' };

        expect(resolvePlaceholders(
            'Implement:\n{{diagram-changes}}', context, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toBe(`Implement:\n${reviewedText}`);
        expect(() => resolvePlaceholders(
            '{{diagram-changes}}', { kind: 'diagram', type: 'root' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toThrow('without an active diagram ID');
        expect(() => resolvePlaceholders(
            '{{diagram-changes}}',
            { diagramChanges: '   ', diagramId: 'diagram-1', kind: 'diagram', type: 'root' },
            project,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
            '',
        )).toThrow('without reviewed diagram changes');
        expect(() => resolvePlaceholders(
            '{{diagram-changes}}', { kind: 'project' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toThrow('outside diagram context');
    });

    it('resolves parent-node only for child diagram context', () => {
        const context = { diagramId: 'diagram-1', diagramItemId: 'item-1', kind: 'diagram', parentNode: 'Orders', type: 'child' };

        expect(resolvePlaceholders(
            '{{parent-node}}', context, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toBe('Orders');
        expect(() => resolvePlaceholders(
            '{{parent-node}}', { kind: 'diagram', type: 'root' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toThrow('outside child diagram context');
        expect(() => resolvePlaceholders(
            '{{parent-node}}', { kind: 'diagram', type: 'child' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '',
        )).toThrow('without a selected diagram item label');
    });

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', { file: 'design/card.md' }, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, 'focus'))
            .toBe('{{rootProjectFolder}} {{file}} {{prompt}}');
    });
});

describe('resolveAgentPrompt', () => {
    it('replaces card-prompt placeholder', () => {
        expect(resolveAgentPrompt({ prompt: 'Review {{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, 'this')).toBe('Review this');
    });

    it('appends nonblank input when placeholder is absent', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, 'this')).toBe('Review\n\nthis');
    });

    it('does not append blank input', () => {
        expect(resolveAgentPrompt({ prompt: 'Review' }, {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '  ')).toBe('Review');
    });

    it('resolves an empty custom prompt', () => {
        expect(resolveAgentPrompt({ prompt: '{{card-prompt}}' }, {}, project, project, projectFolder, releasesFolder, actionsFolder, activeCardsFolder, '')).toBe('');
    });

    it('appends configured diagram footer exactly once before resolution', () => {
        const context = { kind: 'diagram', type: 'root' };
        const diagramFile = 'C:\\worktrees\\2\\design\\diagrams\\Overview.json';

        expect(resolveAgentPrompt(
            { output: { kind: 'diagram' }, prompt: 'Create overview' },
            context,
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
            '',
            'Custom footer: save {{diagram-file}}.',
            diagramFile,
        )).toBe(`Create overview\n\nCustom footer: save ${diagramFile}.`);
    });
});

describe('resolvePopupPrompt', () => {
    it('resolves popup context against linked worktree without rescanning resolved values', () => {
        const context = { file: 'design/card.md', title: '{{card-file}}' };

        expect(resolvePopupPrompt(
            '{{worktree-folder}} {{repository-folder}} {{card-file}} {{card-title}} {{card-prompt}} {{unknown}}',
            context,
            worktreeProject,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
        )).toBe('C:/worktrees/2 C:/repo design/card.md {{card-file}}  {{unknown}}');
    });

    it('rejects missing popup context values', () => {
        expect(() => resolvePopupPrompt(
            '{{card-file}}',
            { kind: 'project' },
            project,
            project,
            projectFolder,
            releasesFolder,
            actionsFolder,
            activeCardsFolder,
        )).toThrow('Cannot resolve card-file placeholder without a file context');
    });
});
