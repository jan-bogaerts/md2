import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildEditorLaunch,
    generateDiff,
    generateWorktreeFileDiff,
    listWorktreeChanges,
    openInEditor,
    openWithSystemApplication,
    parseNameStatus,
    parseEditorTarget,
    parseUnifiedDiff,
    resolveEditorTarget,
} = require('./diff_service');
const { runGit } = require('./git_commands');
const { WorktreeService } = require('./worktree_service');
const { INVALID_LOCAL_FILE_LINK_ERROR, LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR } = require('../../../shared/local_file_link_errors.mjs');

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
    it('parses added, modified, deleted, and renamed null-separated statuses', () => {
        expect(parseNameStatus('A\0added.txt\0M\0modified.txt\0D\0deleted.txt\0R100\0old.txt\0new.txt\0')).toEqual([
            { changeType: 'added', path: 'added.txt' },
            { changeType: 'modified', path: 'modified.txt' },
            { changeType: 'deleted', path: 'deleted.txt' },
            { changeType: 'renamed', oldPath: 'old.txt', path: 'new.txt' },
        ]);
    });

    it('parses unified diff into normalized per-file sides', () => {
        const files = parseUnifiedDiff(SAMPLE_DIFF);

        expect(files).toHaveLength(1);
        const [file] = files;
        expect(file.path).toBe('design/F-010.md');
        expect(file.oldValue).toBe('unchanged line\nold line\ntrailing line');
        expect(file.newValue).toBe('unchanged line\nnew line one\nnew line two\ntrailing line');
        expect(file.oldPath).toBe('design/F-010.md');
    });

    it('rejects empty diff output', () => {
        expect(() => parseUnifiedDiff('   ')).toThrow('produced no output');
    });

    it('rejects output that has no diff headers', () => {
        expect(() => parseUnifiedDiff('not a diff at all')).toThrow('could not be parsed');
    });

    it('runs a fixed full-commit git show without a shell when no file is requested', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }));
        const result = await generateDiff({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { commit: 'abc1234' }, runner);

        expect(runner).toHaveBeenCalledWith(
            'git',
            ['--literal-pathspecs', 'show', '--format=', '--find-renames', 'abc1234'],
            expect.objectContaining({ cwd: 'C:/repo', windowsHide: true }),
        );
        expect(result.commit).toBe('abc1234');
        expect(result.files).toHaveLength(1);
        expect(result.patch).toBe(SAMPLE_DIFF);
    });

    it('limits git show to the selected path passed as one unquoted argument', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }));
        await generateDiff({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { commit: 'abc1234', filePath: 'design/my file.md' }, runner);

        expect(runner).toHaveBeenCalledWith(
            'git',
            ['--literal-pathspecs', 'show', '--format=', '--find-renames', 'abc1234', '--', 'design/my file.md'],
            expect.objectContaining({ cwd: 'C:/repo' }),
        );
    });

    it('rejects an empty selected path before Git starts', async () => {
        const runner = vi.fn();

        await expect(generateDiff({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { commit: 'abc1234', filePath: '' }, runner))
            .rejects.toThrow('Invalid diff file path');
        expect(runner).not.toHaveBeenCalled();
    });

    it('preserves unchanged gaps by returning the exact multi-hunk Git patch', async () => {
        const multiHunkPatch = `${SAMPLE_DIFF}\n@@ -40,1 +41,1 @@ later\n-old later\n+new later`;
        const result = await generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { commit: 'abc1234' },
            vi.fn(async () => ({ stdout: multiHunkPatch })),
        );

        expect(result.patch).toBe(multiHunkPatch);
        expect(result.files[0].oldValue).toBe('unchanged line\nold line\ntrailing line\nold later');
    });

    it('reports Git diff failures clearly', async () => {
        const runner = vi.fn(async () => {
            throw Object.assign(new Error('exit 1'), { stderr: 'fatal: bad object' });
        });

        await expect(generateDiff({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { commit: 'abc1234' }, runner))
            .rejects.toThrow('Git diff failed: fatal: bad object');
    });

    it('fails fast when the commit hash is missing', async () => {
        await expect(generateDiff({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { commit: '' }, vi.fn()))
            .rejects.toThrow('Missing diff commit hash');
    });

    it('lists worktree changes from metadata without reading file contents', async () => {
        const service = {
            readDiffContext: vi.fn(async () => ({
                baseCommit: 'base-1',
                changes: 'M\0modified.txt\0R100\0old.txt\0new.txt\0',
                path: 'C:/worktree',
                untracked: 'untracked.txt\0modified.txt\0',
            })),
        };
        const result = await listWorktreeChanges({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { worktree: 1, worktreeBranch: 'feature' }, service);

        expect(result).toEqual({
            files: [
                { changeType: 'modified', path: 'modified.txt' },
                { changeType: 'renamed', oldPath: 'old.txt', path: 'new.txt' },
                { changeType: 'added', path: 'untracked.txt' },
            ],
            repositoryRoot: 'C:/worktree',
            revision: expect.any(String),
        });
    });

    it('returns an empty worktree manifest instead of failing', async () => {
        const service = { readDiffContext: vi.fn(async () => ({ baseCommit: 'base-1', changes: '', path: 'C:/worktree', untracked: '' })) };

        await expect(listWorktreeChanges({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { worktree: 1, worktreeBranch: 'feature' }, service))
            .resolves.toMatchObject({ files: [] });
    });

    it('reads and builds only the selected added, deleted, or renamed worktree file', async () => {
        const service = {
            readDiffContext: vi.fn(async () => ({
                baseCommit: 'base-1',
                changes: 'A\0added.txt\0D\0deleted.txt\0R100\0old.txt\0new.txt\0',
                path: 'C:/worktree',
                untracked: '',
            })),
        };
        const oldValues = new Map([
            ['deleted.txt', 'deleted without newline'],
            ['old.txt', 'renamed content\n'],
        ]);
        const newValues = new Map([
            ['added.txt', 'added without newline'],
            ['new.txt', 'renamed content\n'],
        ]);
        const readFileValue = vi.fn(async (filePath) => newValues.get(path.basename(filePath)));
        const readRevisionFile = vi.fn(async (_root, _revision, filePath) => oldValues.get(filePath));
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const dependencies = { readFile: readFileValue, readRevisionFile };

        const added = await generateWorktreeFileDiff(project, { path: 'added.txt', worktree: 1, worktreeBranch: 'feature' }, service, dependencies);
        expect(added.patch).toContain('diff --git a/added.txt b/added.txt');
        expect(added.patch).toContain('--- /dev/null');
        expect(added.patch).toContain('\\ No newline at end of file');
        expect(added.patch).not.toContain('deleted.txt');
        expect(readFileValue).toHaveBeenCalledTimes(1);
        expect(readRevisionFile).not.toHaveBeenCalled();

        const deleted = await generateWorktreeFileDiff(project, { path: 'deleted.txt', worktree: 1, worktreeBranch: 'feature' }, service, dependencies);
        expect(deleted.patch).toContain('+++ /dev/null');
        expect(deleted.file).toMatchObject({ changeType: 'deleted', newValue: '', oldValue: 'deleted without newline' });
        expect(readFileValue).toHaveBeenCalledTimes(1);

        const renamed = await generateWorktreeFileDiff(project, { path: 'new.txt', worktree: 1, worktreeBranch: 'feature' }, service, dependencies);
        expect(renamed.patch).toContain('diff --git a/old.txt b/new.txt');
        expect(renamed.patch).toContain('rename from old.txt\nrename to new.txt');
        expect(readRevisionFile).toHaveBeenLastCalledWith('C:/worktree', 'base-1', 'old.txt');
        expect(renamed.repositoryRoot).toBe('C:/worktree');
    });

    it('fails file-scoped when the selected path is no longer changed', async () => {
        const readFileValue = vi.fn();
        const service = { readDiffContext: vi.fn(async () => ({ baseCommit: 'base-1', changes: 'M\0other.txt\0', path: 'C:/worktree', untracked: '' })) };

        await expect(generateWorktreeFileDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { path: 'gone.txt', worktree: 1, worktreeBranch: 'feature' },
            service,
            { readFile: readFileValue, readRevisionFile: vi.fn() },
        )).rejects.toThrow('File is no longer changed in the linked worktree: gone.txt');
        expect(readFileValue).not.toHaveBeenCalled();
    });

    it('fails clearly when worktree patch generation exceeds its bound', async () => {
        const createPatch = vi.fn(() => undefined);
        const service = {
            readDiffContext: vi.fn(async () => ({
                baseCommit: 'base-1',
                changes: 'M\0large.txt\0',
                path: 'C:/worktree',
                untracked: '',
            })),
        };

        await expect(generateWorktreeFileDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { path: 'large.txt', worktree: 1, worktreeBranch: 'feature' },
            service,
            {
                createPatch,
                readFile: vi.fn(async () => 'new'),
                readRevisionFile: vi.fn(async () => 'old'),
            },
        )).rejects.toThrow('Worktree patch generation exceeded complexity bound: large.txt');
        expect(createPatch).toHaveBeenCalledWith(
            'a/large.txt',
            'b/large.txt',
            'old',
            'new',
            undefined,
            undefined,
            expect.objectContaining({ maxEditLength: expect.any(Number), timeout: expect.any(Number) }),
        );
    });

    it('reads complete worktree contribution without changing HEAD, index, or files', async () => {
        const folderPath = await realpath(await mkdtemp(join(tmpdir(), 'md2-worktree-diff-')));
        const primaryPath = join(folderPath, 'primary');
        const linkedPath = join(folderPath, 'linked');
        await mkdir(primaryPath);
        const service = new WorktreeService({ clearTimeout: () => {}, runGit, setTimeout: () => 1 });
        const project = { branch: 'main', id: primaryPath, rootPath: primaryPath };

        try {
            await runGit(primaryPath, ['init', '-b', 'main']);
            await runGit(primaryPath, ['config', 'user.email', 'test@example.com']);
            await runGit(primaryPath, ['config', 'user.name', 'MD2 Test']);
            await writeFile(join(primaryPath, 'modified.txt'), 'old modified\n');
            await writeFile(join(primaryPath, 'deleted.txt'), 'old deleted\n');
            await writeFile(join(primaryPath, 'rename-old.txt'), 'rename content\n');
            await runGit(primaryPath, ['add', '.']);
            await runGit(primaryPath, ['commit', '-m', 'Initial']);
            await runGit(primaryPath, ['worktree', 'add', '-b', 'feature', linkedPath, 'main']);
            await service.startProject(project);
            await writeFile(join(primaryPath, 'primary-only.txt'), 'incoming project change\n');
            await runGit(primaryPath, ['add', 'primary-only.txt']);
            await runGit(primaryPath, ['commit', '-m', 'Project-only change']);

            await writeFile(join(linkedPath, 'modified.txt'), 'new modified\n');
            await unlink(join(linkedPath, 'deleted.txt'));
            await rename(join(linkedPath, 'rename-old.txt'), join(linkedPath, 'rename-new.txt'));
            await runGit(linkedPath, ['add', 'rename-old.txt', 'rename-new.txt']);
            await writeFile(join(linkedPath, 'added.txt'), 'new file\n');
            const before = {
                cached: await runGit(linkedPath, ['diff', '--cached']),
                head: await runGit(linkedPath, ['rev-parse', 'HEAD']),
                status: await runGit(linkedPath, ['status', '--porcelain=v1']),
            };

            const manifest = await listWorktreeChanges(project, { worktree: 1, worktreeBranch: 'feature' }, service);
            const modified = await generateWorktreeFileDiff(project, { path: 'modified.txt', worktree: 1, worktreeBranch: 'feature' }, service);

            expect(manifest.repositoryRoot).toBe(path.resolve(linkedPath));
            expect(manifest.files).toEqual([
                { changeType: 'deleted', path: 'deleted.txt' },
                { changeType: 'modified', path: 'modified.txt' },
                { changeType: 'renamed', oldPath: 'rename-old.txt', path: 'rename-new.txt' },
                { changeType: 'added', path: 'added.txt' },
            ]);
            expect(modified.file).toMatchObject({ newValue: 'new modified\n', oldValue: 'old modified\n' });
            expect(await readFile(join(linkedPath, 'added.txt'), 'utf8')).toBe('new file\n');
            await expect(Promise.resolve({
                cached: await runGit(linkedPath, ['diff', '--cached']),
                head: await runGit(linkedPath, ['rev-parse', 'HEAD']),
                status: await runGit(linkedPath, ['status', '--porcelain=v1']),
            })).resolves.toEqual(before);
        } finally {
            service.stopProject();
            await rm(folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('reports invalid worktree resolution and Git content failures without another repository fallback', async () => {
        const readFileValue = vi.fn();
        const invalidService = {readDiffContext: vi.fn(async () => { throw new Error('Configured worktree 3 does not exist'); })};

        await expect(generateWorktreeFileDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/primary' },
            { path: 'file.txt', worktree: 3, worktreeBranch: 'missing' },
            invalidService,
            { readFile: readFileValue },
        )).rejects.toThrow('Configured worktree 3 does not exist');
        expect(readFileValue).not.toHaveBeenCalled();

        const removedService = {
            readDiffContext: vi.fn(async () => ({
                baseCommit: 'abc123',
                changes: 'M\0file.txt\0',
                path: 'C:/removed-worktree',
                untracked: '',
            })),
        };
        await expect(generateWorktreeFileDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/primary' },
            { path: 'file.txt', worktree: 1, worktreeBranch: 'feature' },
            removedService,
            { readFile: readFileValue, readRevisionFile: vi.fn(async () => { throw new Error('fatal: not a git repository'); }) },
        )).rejects.toThrow('fatal: not a git repository');
        expect(readFileValue).not.toHaveBeenCalledWith(expect.stringContaining('primary'), expect.anything());
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
            { path: path.resolve('C:/repo/src/file.js'), repositoryRoot: 'C:/worktree' },
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
            .rejects.toMatchObject({ code: LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR, message: expect.stringContaining('outside active repository') });
        await expect(resolveEditorTarget(project, { path: 'missing.js', repositoryRoot: 'C:/repo' }, [], vi.fn(async () => { throw new Error('ENOENT'); })))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR, message: expect.stringContaining('target does not exist') });
        await expect(resolveEditorTarget(project, { path: 'folder', repositoryRoot: 'C:/repo' }, [], vi.fn(async () => ({ isFile: () => false }))))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR, message: expect.stringContaining('not a regular file') });
        await expect(resolveEditorTarget(project, { path: 'file.js:abc', repositoryRoot: 'C:/repo' }, [], vi.fn()))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR });
        await expect(resolveEditorTarget(project, { path: '%E0%A4%A', repositoryRoot: 'C:/repo' }, [], vi.fn()))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR });
    });

    it('keeps unregistered repository roots as unexpected errors', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

        const error = await resolveEditorTarget(project, { path: 'file.js', repositoryRoot: 'C:/other' }, [], vi.fn()).catch((rejection) => rejection);

        expect(error.code).toBeUndefined();
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

describe('openWithSystemApplication', () => {
    const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
    const fileStat = vi.fn(async () => ({ isFile: () => true }));

    it('opens a relative link outside the repository relative to the conversation repository root', async () => {
        const openPath = vi.fn(async () => '');

        await openWithSystemApplication(project, { path: '../notes/todo.txt', repositoryRoot: 'C:/worktree' }, { openPath, statFile: fileStat, worktreeRoots: ['C:/worktree'] });

        expect(openPath).toHaveBeenCalledWith(path.resolve('C:/notes/todo.txt'));
    });

    it('opens an absolute link outside the repository without its numeric line suffix', async () => {
        const openPath = vi.fn(async () => '');

        await openWithSystemApplication(project, { path: 'C:/Users/me/report.pdf:12', repositoryRoot: 'C:/repo' }, { openPath, statFile: fileStat });

        expect(openPath).toHaveBeenCalledWith(path.resolve('C:/Users/me/report.pdf'));
    });

    it('rejects missing, directory, and malformed targets as expected link errors without opening them', async () => {
        const openPath = vi.fn(async () => '');
        const request = { path: 'C:/outside/target', repositoryRoot: 'C:/repo' };
        const missingStat = vi.fn(async () => { throw new Error('ENOENT'); });
        const directoryStat = vi.fn(async () => ({ isFile: () => false }));

        await expect(openWithSystemApplication(project, request, { openPath, statFile: missingStat }))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR, message: expect.stringContaining('does not exist') });
        await expect(openWithSystemApplication(project, request, { openPath, statFile: directoryStat }))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR, message: expect.stringContaining('not a regular file') });
        await expect(openWithSystemApplication(project, { path: '%E0%A4%A', repositoryRoot: 'C:/repo' }, { openPath, statFile: fileStat }))
            .rejects.toMatchObject({ code: INVALID_LOCAL_FILE_LINK_ERROR });
        expect(openPath).not.toHaveBeenCalled();
    });

    it('refuses targets inside the repository or a registered worktree', async () => {
        const openPath = vi.fn(async () => '');

        await expect(openWithSystemApplication(project, { path: 'C:/worktree/src/file.js', repositoryRoot: 'C:/repo' }, { openPath, statFile: fileStat, worktreeRoots: ['C:/worktree'] }))
            .rejects.toThrow('configured editor');
        expect(openPath).not.toHaveBeenCalled();
    });

    it('reports operating system launch failures as unexpected errors', async () => {
        const openPath = vi.fn(async () => 'No application is associated');

        const error = await openWithSystemApplication(project, { path: 'C:/outside/file.xyz', repositoryRoot: 'C:/repo' }, { openPath, statFile: fileStat })
            .catch((rejection) => rejection);

        expect(error.message).toBe('Opening local file failed: No application is associated');
        expect(error.code).toBeUndefined();
    });
});
