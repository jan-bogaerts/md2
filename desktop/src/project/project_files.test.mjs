import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
    createProject,
    listRepositoryFiles,
    loadProject,
    PROJECT_README_TEMPLATE,
} = require('./project_files');

async function initializeRepository(rootPath) {
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: rootPath });
    await execFileAsync('git', ['config', 'user.email', 'md2-test@example.com'], { cwd: rootPath });
    await execFileAsync('git', ['config', 'user.name', 'MD2 Test'], { cwd: rootPath });
}

describe('project-files', () => {
    it('creates nested project and active folders with the project template', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-create-'));

        try {
            await initializeRepository(rootPath);
            const project = { branch: 'main', id: rootPath, rootPath };

            await createProject(project, 'design/active');

            await expect(readFile(join(rootPath, 'design', 'active', 'README.md'), 'utf8')).resolves.toBe(PROJECT_README_TEMPLATE);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

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
});
