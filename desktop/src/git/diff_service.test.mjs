import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildEditorLaunch,
    generateDiff,
    openInEditor,
    parseEditorTarget,
    parseUnifiedDiff,
    resolveDiffCommand,
    resolveEditorTarget,
} = require('./diff_service');

const SAMPLE_DIFF = [
    'diff --git a/design/F-010.md b/design/F-010.md',
    'index 1111111..2222222 100644',
    '--- a/design/F-010.md',
    '+++ b/design/F-010.md',
    '@@ -10,3 +10,4 @@ context header',
    ' unchanged line',
    '-old line',
    '+new line one',
    '+new line two',
    ' trailing line',
].join('\n');

describe('diff-service', () => {
    it('parses unified diff into per-file sides with real line numbers', () => {
        const files = parseUnifiedDiff(SAMPLE_DIFF);

        expect(files).toHaveLength(1);
        const [file] = files;
        expect(file.path).toBe('design/F-010.md');
        expect(file.oldValue).toBe('unchanged line\nold line\ntrailing line');
        expect(file.newValue).toBe('unchanged line\nnew line one\nnew line two\ntrailing line');
        expect(file.oldLineNumbers).toEqual([10, 11, 12]);
        expect(file.newLineNumbers).toEqual([10, 11, 12, 13]);
    });

    it('rejects empty diff output', () => {
        expect(() => parseUnifiedDiff('   ')).toThrow('produced no output');
    });

    it('rejects output that has no diff headers', () => {
        expect(() => parseUnifiedDiff('not a diff at all')).toThrow('could not be parsed');
    });

    it('resolves diff command and folder placeholders', () => {
        const values = {
            commit: 'abc1234',
            file: 'design/F-010.md',
            'project-folder': 'C:/repo/design',
            'repository-folder': 'C:/repo',
            'releases-folder': 'C:/repo/delivery/releases',
            'worktree-folder': 'C:/repo',
        };
        const command = resolveDiffCommand(
            'git -C {{worktree-folder}} show {{commit}} -- {{file}} {{repository-folder}} {{project-folder}} {{releases-folder}}',
            values,
        );

        expect(command).toBe('git -C C:/repo show abc1234 -- design/F-010.md C:/repo C:/repo/design C:/repo/delivery/releases');
    });

    it('fails fast when a diff placeholder value is missing', () => {
        expect(() => resolveDiffCommand('git show {{commit}}', { commit: '' })).toThrow('Missing diff command value: commit');
    });

    it('does not resolve removed rootProjectFolder placeholder', () => {
        expect(resolveDiffCommand('git -C {{rootProjectFolder}} show {{commit}}', { commit: 'abc1234' }))
            .toBe('git -C {{rootProjectFolder}} show abc1234');
    });

    it('generates normalized diff data through the runner', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }));
        const result = await generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', projectFolder: '', template: 'git show {{commit}}' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith('git show abc1234', expect.objectContaining({ cwd: 'C:/repo' }));
        expect(result.commit).toBe('abc1234');
        expect(result.files).toHaveLength(1);
    });

    it('resolves custom releases folder from the opened repository for diff commands', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }));
        const template = 'git -C {{repository-folder}} show {{commit}} -- {{project-folder}} {{releases-folder}}';
        await generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', projectFolder: 'design', releasesFolder: 'design/delivery/releases', template },
            runner,
        );

        expect(runner).toHaveBeenCalledWith(
            `git -C C:/repo show abc1234 -- ${path.resolve('C:/repo', 'design')} ${path.resolve('C:/repo', 'design/delivery/releases')}`,
            expect.objectContaining({ cwd: 'C:/repo' }),
        );
    });

    it('makes repository and project folders equal for an empty configured project folder', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }));
        await generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', projectFolder: '', template: 'echo {{repository-folder}} {{project-folder}}' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith('echo C:/repo C:/repo', expect.objectContaining({ cwd: 'C:/repo' }));
    });

    it('fails before running when configured project folder is missing', async () => {
        const runner = vi.fn();

        await expect(generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', template: 'echo {{project-folder}}' },
            runner,
        )).rejects.toThrow('Missing diff command value: project-folder');
        expect(runner).not.toHaveBeenCalled();
    });

    it('reports diff command failures clearly', async () => {
        const runner = vi.fn(async () => {
            throw Object.assign(new Error('exit 1'), { stderr: 'fatal: bad object' });
        });

        await expect(generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', projectFolder: '', template: 'git show {{commit}}' },
            runner,
        )).rejects.toThrow('Diff command failed: fatal: bad object');
    });

    it('fails fast when the commit hash is missing', async () => {
        await expect(generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: '', filePath: '', projectFolder: '', template: 'git show {{commit}}' },
            vi.fn(),
        )).rejects.toThrow('Missing diff commit hash');
    });

    it('substitutes default and custom editor command placeholders', () => {
        expect(buildEditorLaunch('code -g "{{file}}:{{line}}"', 'C:\\repo\\file.js', 42))
            .toBe('code -g "C:\\repo\\file.js:42"');
        expect(buildEditorLaunch('editor --file "{{file}}"', 'C:\\repo\\file.js', 42))
            .toBe('editor --file "C:\\repo\\file.js"');
    });

    it('requires file placeholder in editor command', () => {
        expect(() => buildEditorLaunch('editor --line {{line}}', 'C:\\repo\\file.js', 1)).toThrow('requires {{file}}');
    });

    it('parses optional line suffix and rejects invalid suffixes', () => {
        expect(parseEditorTarget({ path: 'src/file.js:12' })).toEqual({ line: 12, path: 'src/file.js' });
        expect(parseEditorTarget({ path: 'src/file.js' })).toEqual({ line: 1, path: 'src/file.js' });
        expect(parseEditorTarget({ line: 7, path: 'src/file.js' })).toEqual({ line: 7, path: 'src/file.js' });
        expect(() => parseEditorTarget({ path: 'src/file.js:abc' })).toThrow('Invalid editor line suffix');
        expect(() => parseEditorTarget({ path: 'src/file.js:0' })).toThrow('Invalid editor line suffix');
    });

    it('resolves relative worktree files and permits absolute files in registered roots', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const statFile = vi.fn(async () => ({ isFile: () => true }));
        const relative = await resolveEditorTarget(
            project,
            { path: 'src/file.js:12', repositoryRoot: 'C:/worktree' },
            ['C:/worktree'],
            statFile,
        );
        const absolute = await resolveEditorTarget(
            project,
            { path: 'C:/repo/src/file.js', repositoryRoot: 'C:/worktree' },
            ['C:/worktree'],
            statFile,
        );

        expect(relative).toEqual({ filePath: path.resolve('C:/worktree', 'src/file.js'), line: 12, repositoryRoot: path.resolve('C:/worktree') });
        expect(absolute.filePath).toBe(path.resolve('C:/repo/src/file.js'));
    });

    it('rejects unregistered roots, escaped paths, missing files, and folders', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        await expect(resolveEditorTarget(project, { path: 'file.js', repositoryRoot: 'C:/other' }, [], vi.fn()))
            .rejects.toThrow('not active or registered');
        await expect(resolveEditorTarget(project, { path: '../outside.js', repositoryRoot: 'C:/repo' }, [], vi.fn()))
            .rejects.toThrow('outside active repository');
        await expect(resolveEditorTarget(project, { path: 'missing.js', repositoryRoot: 'C:/repo' }, [], vi.fn(async () => { throw new Error('ENOENT'); })))
            .rejects.toThrow('target does not exist');
        await expect(resolveEditorTarget(project, { path: 'folder', repositoryRoot: 'C:/repo' }, [], vi.fn(async () => ({ isFile: () => false }))))
            .rejects.toThrow('not a regular file');
    });

    it('spawns configured editor with selected worktree cwd', async () => {
        const handlers = new Map();
        const child = { on: vi.fn((event, handler) => handlers.set(event, handler)) };
        const spawnProcess = vi.fn(() => child);
        const openPromise = openInEditor(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { path: 'src/file.js:7', repositoryRoot: 'C:/worktree' },
            { editorCommand: 'custom "{{file}}" --line {{line}}', spawnProcess, statFile: vi.fn(async () => ({ isFile: () => true })), worktreeRoots: ['C:/worktree'] },
        );

        await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalled());
        expect(spawnProcess).toHaveBeenCalledWith(expect.stringContaining('--line 7'), expect.objectContaining({ cwd: path.resolve('C:/worktree'), shell: true }));
        handlers.get('exit')(0);

        await expect(openPromise).resolves.toBeUndefined();
    });

    it('rejects when the editor process fails to spawn', async () => {
        const handlers = new Map();
        const child = {
            on: vi.fn((event, handler) => {
                handlers.set(event, handler);
            }),
        };
        const spawnProcess = vi.fn(() => child);
        const openPromise = openInEditor(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { line: 7, path: 'design/F-010.md', repositoryRoot: 'C:/repo' },
            { editorCommand: 'code -g "{{file}}:{{line}}"', spawnProcess, statFile: vi.fn(async () => ({ isFile: () => true })) },
        );

        await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalled());
        handlers.get('error')(new Error('spawn code ENOENT'));

        await expect(openPromise).rejects.toThrow('Editor launch failed: spawn code ENOENT');
    });
});
