import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
    listRepositoryFiles,
    loadProject,
    moveFiles,
} = require('./project_files');

async function runGit(rootPath, argumentsList) {
    const { stdout } = await execFileAsync('git', argumentsList, { cwd: rootPath });

    return stdout.trim();
}

async function initializeGitRepository(rootPath) {
    await runGit(rootPath, ['init']);
    await runGit(rootPath, ['config', 'user.email', 'test@example.com']);
    await runGit(rootPath, ['config', 'user.name', 'Test User']);
}

describe('project-files', () => {
    it('loads markdown files from the working folder and subfolders', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

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

    it('lists repository files as normalized repo-relative paths excluding git internals', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

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

    it('moves and commits an untracked external card', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'New card.md'), '# New card');

            await moveFiles({
                message: 'Import external card',
                moves: [{
                    content: '---\nid: F_1\n---\n\n# New card',
                    fromPath: 'design/New card.md',
                    toPath: 'design/F_1_new_card.md',
                }],
            }, { branch: 'main', id: 'local', rootPath });

            expect(await readFile(join(rootPath, 'design', 'F_1_new_card.md'), 'utf8')).toContain('id: F_1');
            expect(await runGit(rootPath, ['ls-files'])).toBe('design/F_1_new_card.md');
            expect(await runGit(rootPath, ['log', '-1', '--pretty=%s'])).toBe('Import external card');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('keeps using a Git move for a tracked card', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await initializeGitRepository(rootPath);
            await mkdir(join(rootPath, 'design'));
            await writeFile(join(rootPath, 'design', 'F_1_old.md'), '# Old');
            await runGit(rootPath, ['add', 'design/F_1_old.md']);
            await runGit(rootPath, ['commit', '-m', 'Add old card']);

            await moveFiles({
                message: 'Rename card',
                moves: [{
                    content: '# Renamed',
                    fromPath: 'design/F_1_old.md',
                    toPath: 'design/F_1_renamed.md',
                }],
            }, { branch: 'main', id: 'local', rootPath });

            expect(await readFile(join(rootPath, 'design', 'F_1_renamed.md'), 'utf8')).toBe('# Renamed');
            expect(await runGit(rootPath, ['status', '--short'])).toBe('');
            expect(await runGit(rootPath, ['log', '-1', '--pretty=%s'])).toBe('Rename card');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
