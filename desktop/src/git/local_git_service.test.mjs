import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const GIT_INTEGRATION_TEST_TIMEOUT_MS = 15000;

const require = createRequire(import.meta.url);
const {
    cancelActionSchedule,
    commit,
    createWorkingFolderFromTemplate,
    deleteFile,
    deleteFolder,
    hasPendingPush,
    listRepositoryFiles,
    listTopLevelFolders,
    loadActionFiles,
    loadActionSchedules,
    loadAgentConversation,
    loadFile,
    loadProjectAsset,
    loadProject,
    loadProjectRoot,
    loadProjectConfig,
    moveFiles,
    runCommand,
    saveActionSchedules,
    saveProjectConfig,
    watchProject,
} = require('./local_git_service');

async function initializeGitRepository(rootPath) {
    await execFileAsync('git', ['init'], { cwd: rootPath });
    await execFileAsync('git', ['config', 'user.email', 'md2@example.test'], { cwd: rootPath });
    await execFileAsync('git', ['config', 'user.name', 'MD² Test'], { cwd: rootPath });
}

async function commitCount(rootPath) {
    const result = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd: rootPath });

    return Number.parseInt(result.stdout.trim(), 10);
}

describe('local-git-service', () => {
    it('detects commits ahead of the configured upstream', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        const remotePath = await mkdtemp(join(tmpdir(), 'md2-local-git-remote-'));

        try {
            await execFileAsync('git', ['init', '--bare'], { cwd: remotePath });
            await initializeGitRepository(rootPath);
            await execFileAsync('git', ['checkout', '-b', 'main'], { cwd: rootPath });
            await writeFile(join(rootPath, 'README.md'), '# Project');
            await execFileAsync('git', ['add', 'README.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: rootPath });
            const project = { branch: 'main', id: 'local', rootPath };

            await expect(hasPendingPush(project)).resolves.toBe(true);

            await execFileAsync('git', ['remote', 'add', 'origin', remotePath], { cwd: rootPath });
            await execFileAsync('git', ['push', '--set-upstream', 'origin', 'main'], { cwd: rootPath });

            await expect(hasPendingPush(project)).resolves.toBe(false);

            await writeFile(join(rootPath, 'README.md'), '# Changed project');
            await execFileAsync('git', ['add', 'README.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Update project'], { cwd: rootPath });

            await expect(hasPendingPush(project)).resolves.toBe(true);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
            await rm(remotePath, { force: true, recursive: true });
        }
    }, GIT_INTEGRATION_TEST_TIMEOUT_MS);

    it('loads markdown files from the working folder and subfolders', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'history'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            await writeFile(join(rootPath, 'design', 'history', 'F-2-old.md'), '# Old');

            const projectFiles = await loadProject({ branch: 'main', id: 'local', rootPath }, 'design');

            expect(projectFiles.files.map((file) => file.path).sort()).toEqual(['design/F-1-root.md', 'design/history/F-2-old.md']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads only direct markdown files from the working folder root', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'history'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            await writeFile(join(rootPath, 'design', 'notes.txt'), 'Notes');
            await writeFile(join(rootPath, 'design', 'history', 'F-2-old.md'), '# Old');

            const projectFiles = await loadProjectRoot({ branch: 'main', id: 'local', rootPath }, 'design');

            expect(projectFiles.files.map((file) => file.path)).toEqual(['design/F-1-root.md']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads one markdown file by repository-relative path', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');

            await expect(loadFile({ branch: 'main', id: 'local', rootPath }, 'design/F-1-root.md')).resolves.toEqual({
                content: '# Root',
                path: 'design/F-1-root.md',
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads image assets by repository-relative path as base64', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'), { recursive: true });
            await writeFile(join(rootPath, 'actions', 'icon.png'), Buffer.from('icon'));

            await expect(loadProjectAsset({ branch: 'main', id: 'local', rootPath }, 'actions/icon.png')).resolves.toEqual({
                content: Buffer.from('icon').toString('base64'),
                contentType: 'image/png',
                encoding: 'base64',
                path: 'actions/icon.png',
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('throws a clear missing-folder error without creating template content on load', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            await expect(loadProject({ branch: 'main', id: 'local', rootPath }, 'design')).rejects.toMatchObject({
                code: 'missing-working-folder',
                message: 'Working folder is missing: design',
                workingFolder: 'design',
            });
            await expect(readFile(join(rootPath, 'design', 'README.md'), 'utf8')).rejects.toThrow();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('creates template content when explicitly requested', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);

            await createWorkingFolderFromTemplate({ branch: 'main', id: 'local', rootPath }, 'design');

            await expect(readFile(join(rootPath, 'design', 'README.md'), 'utf8')).resolves.toContain('Project design folder');
            const log = await execFileAsync('git', ['log', '-1', '--pretty=%s'], { cwd: rootPath });
            expect(log.stdout.trim()).toBe('Create design workspace');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not create a commit when template content already exists', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'README.md'), '# MD²\n\nProject design folder created by MD².\n');
            await execFileAsync('git', ['add', 'design/README.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed workspace'], { cwd: rootPath });

            await createWorkingFolderFromTemplate({ branch: 'main', id: 'local', rootPath }, 'design');

            expect(await commitCount(rootPath)).toBe(1);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads json action files from the actions folder', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}');
            await writeFile(join(rootPath, 'actions', '.md2-schedules.json'), '{"schedules":[]}');
            await writeFile(join(rootPath, 'actions', 'notes.md'), '# skip me');

            const files = await loadActionFiles({ branch: 'main', id: 'local', rootPath }, 'actions');

            expect(files).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('lists repository files as normalized repo-relative paths excluding git internals', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'), { recursive: true });
            await writeFile(join(rootPath, '.git', 'config'), 'git config');
            await mkdir(join(rootPath, 'app', 'src'), { recursive: true });
            await writeFile(join(rootPath, 'app', 'src', 'main.tsx'), 'main');
            await writeFile(join(rootPath, 'README.md'), 'readme');

            const files = await listRepositoryFiles({ branch: 'main', id: 'local', rootPath });

            expect(files).toEqual(['app/src/main.tsx', 'README.md']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('lists top-level folders excluding git internals', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'), { recursive: true });
            await mkdir(join(rootPath, 'app'));
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'README.md'), 'readme');

            const folders = await listTopLevelFolders({ branch: 'main', id: 'local', rootPath });

            expect(folders).toEqual([{ name: 'app', path: 'app' }, { name: 'design', path: 'design' }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('returns no action files when the actions folder is missing', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            await expect(loadActionFiles({ branch: 'main', id: 'local', rootPath }, 'actions')).resolves.toEqual([]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads project config from the repository root', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await writeFile(join(rootPath, 'md2.config.json'), JSON.stringify({ pushMode: 'manual', workingFolder: 'docs' }));

            await expect(loadProjectConfig({ branch: 'main', id: 'local', rootPath })).resolves.toEqual({
                pushMode: 'manual',
                workingFolder: 'docs',
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('runs commands from the project root and captures output', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            const result = await runCommand(
                { branch: 'main', id: 'local', rootPath },
                'node -e "process.stdout.write(process.cwd())"',
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(rootPath);
            expect(result.stderr).toBe('');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('returns failed command output without throwing', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            const result = await runCommand(
                { branch: 'main', id: 'local', rootPath },
                'node -e "process.stderr.write(\'bad\'); process.exit(7)"',
            );

            expect(result.exitCode).toBe(7);
            expect(result.stderr).toBe('bad');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects non-string commands from the bridge surface', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            await expect(runCommand({ branch: 'main', id: 'local', rootPath }, { command: 'git status' })).rejects.toThrow('Missing command text');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects activity conversation paths that escape the project root', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            await expect(loadAgentConversation({ branch: 'main', id: 'local', rootPath }, '../activity.json#conversation=agent-1')).rejects.toThrow(
                'Local Git path escapes project root',
            );
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('persists and loads action schedules from the actions folder', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        const schedule = {
            actionId: 'implement',
            context: { file: 'design/F-022.md', kind: 'card', type: 'feature' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            status: 'pending',
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        };

        try {
            await mkdir(join(rootPath, '.git'));

            await saveActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions', [schedule]);

            await expect(readFile(join(rootPath, 'actions', '.md2-schedules.json'), 'utf8')).resolves.toContain('"schedules"');
            await expect(loadActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions')).resolves.toEqual([schedule]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('returns an empty schedule list when no schedule file exists', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));

            await expect(loadActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions')).resolves.toEqual([]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('cancels pending schedules by updating the schedule file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        const schedule = {
            actionId: 'implement',
            context: { file: 'design/F-022.md', kind: 'card', type: 'feature' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            status: 'pending',
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        };

        try {
            await mkdir(join(rootPath, '.git'));
            await saveActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions', [schedule]);

            await expect(cancelActionSchedule({ branch: 'main', id: 'local', rootPath }, 'actions', 'schedule-1')).resolves.toEqual([
                { ...schedule, status: 'cancelled' },
            ]);
            await expect(loadActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions')).resolves.toEqual([
                { ...schedule, status: 'cancelled' },
            ]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects invalid schedule files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', '.md2-schedules.json'), '{"schedules":[{"id":"schedule-1"}]}');

            await expect(loadActionSchedules({ branch: 'main', id: 'local', rootPath }, 'actions')).rejects.toThrow('missing actionId');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('writes base64-encoded files as binary and commits them alongside text files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));

            await commit({
                files: [
                    { content: '# Card', path: 'design/F-1-card.md' },
                    { content: Buffer.from('binary-bytes').toString('base64'), encoding: 'base64', path: 'design/note.png' },
                ],
                message: 'Import Remarkable asset',
            }, { branch: 'main', id: 'local', rootPath });

            const written = await readFile(join(rootPath, 'design', 'note.png'));
            expect(written.toString()).toBe('binary-bytes');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not create a commit when saved content is unchanged', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F-1-card.md'), '# Card');
            await execFileAsync('git', ['add', 'design/F-1-card.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed card'], { cwd: rootPath });

            await commit({
                files: [{ content: '# Card', path: 'design/F-1-card.md' }],
                message: 'Update design/F-1-card.md',
            }, { branch: 'main', id: 'local', rootPath });

            expect(await commitCount(rootPath)).toBe(1);
            const status = await execFileAsync('git', ['status', '--short'], { cwd: rootPath });
            expect(status.stdout).toBe('');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('commits a mixed batch with changed and unchanged files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F-1-card.md'), '# Card');
            await writeFile(join(rootPath, 'design', 'F-2-card.md'), '# Old');
            await execFileAsync('git', ['add', 'design/F-1-card.md', 'design/F-2-card.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed cards'], { cwd: rootPath });

            await commit({
                files: [
                    { content: '# Card', path: 'design/F-1-card.md' },
                    { content: '# New', path: 'design/F-2-card.md' },
                ],
                message: 'Update cards',
            }, { branch: 'main', id: 'local', rootPath });

            expect(await commitCount(rootPath)).toBe(2);
            await expect(readFile(join(rootPath, 'design', 'F-1-card.md'), 'utf8')).resolves.toBe('# Card');
            await expect(readFile(join(rootPath, 'design', 'F-2-card.md'), 'utf8')).resolves.toBe('# New');
            const log = await execFileAsync('git', ['log', '-1', '--pretty=%s'], { cwd: rootPath });
            expect(log.stdout.trim()).toBe('Update cards');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not create a project config commit when config is unchanged', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        const config = { pushMode: 'manual', workingFolder: 'design' };

        try {
            await initializeGitRepository(rootPath);
            await writeFile(join(rootPath, 'md2.config.json'), `${JSON.stringify(config, null, 2)}\n`);
            await execFileAsync('git', ['add', 'md2.config.json'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed config'], { cwd: rootPath });

            await saveProjectConfig({ branch: 'main', id: 'local', rootPath }, config);

            expect(await commitCount(rootPath)).toBe(1);
            const status = await execFileAsync('git', ['status', '--short'], { cwd: rootPath });
            expect(status.stdout).toBe('');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('moves files with git mv and commits the archive', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            await execFileAsync('git', ['add', 'design/F-1-root.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed card'], { cwd: rootPath });

            await moveFiles({
                message: 'Complete release v1',
                moves: [{ content: '# Root', fromPath: 'design/F-1-root.md', toPath: 'design/history/v1/F-1-root.md' }],
            }, { branch: 'main', id: 'local', rootPath });

            await expect(readFile(join(rootPath, 'design', 'history', 'v1', 'F-1-root.md'), 'utf8')).resolves.toBe('# Root');
            await expect(readFile(join(rootPath, 'design', 'F-1-root.md'), 'utf8')).rejects.toThrow();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('deletes files with git rm and commits the deletion', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            await execFileAsync('git', ['add', 'design/F-1-root.md'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed card'], { cwd: rootPath });

            await deleteFile({
                branch: 'main',
                message: 'Delete obsolete card',
                path: 'design/F-1-root.md',
            }, { branch: 'main', id: 'local', rootPath });

            await expect(readFile(join(rootPath, 'design', 'F-1-root.md'), 'utf8')).rejects.toThrow();
            const status = await execFileAsync('git', ['status', '--short'], { cwd: rootPath });
            const log = await execFileAsync('git', ['log', '-1', '--pretty=%s'], { cwd: rootPath });
            expect(status.stdout).toBe('');
            expect(log.stdout.trim()).toBe('Delete obsolete card');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('deletes folders recursively with git rm and commits the deletion', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design', 'notes', 'nested'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'notes', '.gitkeep'), '');
            await writeFile(join(rootPath, 'design', 'notes', 'nested', 'info.txt'), 'Info');
            await execFileAsync('git', ['add', 'design/notes'], { cwd: rootPath });
            await execFileAsync('git', ['commit', '-m', 'Seed notes'], { cwd: rootPath });

            await deleteFolder({
                branch: 'main',
                message: 'Delete design/notes',
                path: 'design/notes',
            }, { branch: 'main', id: 'local', rootPath });

            await expect(readFile(join(rootPath, 'design', 'notes', 'nested', 'info.txt'), 'utf8')).rejects.toThrow();
            const status = await execFileAsync('git', ['status', '--short'], { cwd: rootPath });
            const log = await execFileAsync('git', ['log', '-1', '--pretty=%s'], { cwd: rootPath });
            expect(status.stdout).toBe('');
            expect(log.stdout.trim()).toBe('Delete design/notes');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports json file changes for action hot-reload', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        let closeWatcher = null;

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'));
            const event = new Promise((resolve) => {
                closeWatcher = watchProject({ branch: 'main', id: 'local', rootPath }, resolve);
            });

            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}');

            await expect(event).resolves.toMatchObject({ path: 'actions/implement.json' });
        } finally {
            if (closeWatcher) closeWatcher();
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports removed markdown files with change kind', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'));
        let closeWatcher = null;

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            const event = new Promise((resolve) => {
                closeWatcher = watchProject({ branch: 'main', id: 'local', rootPath }, resolve);
            });

            await rm(join(rootPath, 'design', 'F-1-root.md'));

            await expect(event).resolves.toEqual({ changeKind: 'removed', path: 'design/F-1-root.md' });
        } finally {
            if (closeWatcher) closeWatcher();
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
