import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { GitProcess } = require('../git/git_process');
const { MANAGED_BLOCK_BEGIN } = require('./gitignore_managed_block');
const { hasTrackedProjectFolderFiles, saveProjectFolderGitInclusionNow } = require('./project_folder_git_inclusion');

const STAGED_CHANGES = Object.assign(new Error('staged changes'), { code: 1 });

/** Mocks Git: `trackedOutput` answers the project-folder `ls-files` query; `diff --cached` reports staged changes. */
function mockGit(trackedOutput) {
    return vi.spyOn(GitProcess.prototype, 'run').mockImplementation(async function run() {
        if (this.args[0] === 'diff') throw STAGED_CHANGES;
        if (this.args.includes('ls-files')) return { stderr: '', stdout: trackedOutput };

        return { stderr: '', stdout: '' };
    });
}

function gitArguments(runGitProcess) {
    return runGitProcess.mock.instances.map(({ args }) => args);
}

describe('project folder Git inclusion', () => {
    let rootPath = '';
    let project = null;

    beforeEach(async () => {
        rootPath = await mkdtemp(join(tmpdir(), 'md2-project-folder-git-'));
        project = { branch: 'main', id: 'local', rootPath };
        await mkdir(join(rootPath, '.git'));
        await mkdir(join(rootPath, 'design', 'active'), { recursive: true });
        await writeFile(join(rootPath, 'design', 'active', 'F-1.md'), '# Card');
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await rm(rootPath, { force: true, recursive: true });
    });

    it('removes tracked project-folder files from the index, keeps them on disk, and commits config and ignore rule', async () => {
        const runGitProcess = mockGit('design/active/F-1.md\0');
        const config = { includeProjectFolderInGit: false, projectFolder: 'design' };

        await saveProjectFolderGitInclusionNow(project, config, true);

        const commands = gitArguments(runGitProcess);
        expect(commands).toContainEqual(['rm', '-r', '--cached', '--quiet', '--', 'design']);
        expect(commands).toContainEqual(['add', 'md2.config.json']);
        expect(commands).toContainEqual(['add', '.gitignore']);
        expect(commands).toContainEqual(['commit', '-m', 'Update MD² project folder Git inclusion']);
        await expect(readFile(join(rootPath, 'design', 'active', 'F-1.md'), 'utf8')).resolves.toBe('# Card');
        await expect(readFile(join(rootPath, '.gitignore'), 'utf8')).resolves.toContain('/design/');
        await expect(readFile(join(rootPath, 'md2.config.json'), 'utf8')).resolves.toContain('"includeProjectFolderInGit": false');
    });

    it('refuses to exclude a tracked project folder without confirmed index removal and writes nothing', async () => {
        const runGitProcess = mockGit('design/active/F-1.md\0');

        await expect(saveProjectFolderGitInclusionNow(project, { includeProjectFolderInGit: false, projectFolder: 'design' }, false))
            .rejects.toThrow('Git still tracks files in design');

        expect(gitArguments(runGitProcess).some(([command]) => command === 'rm' || command === 'commit')).toBe(false);
        await expect(readFile(join(rootPath, '.gitignore'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(readFile(join(rootPath, 'md2.config.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('excludes an untracked project folder without touching the index', async () => {
        const runGitProcess = mockGit('');
        await writeFile(join(rootPath, '.gitignore'), 'node_modules/\r\n');

        await saveProjectFolderGitInclusionNow(project, { includeProjectFolderInGit: false, projectFolder: 'design' }, false);

        expect(gitArguments(runGitProcess).some(([command]) => command === 'rm')).toBe(false);
        await expect(readFile(join(rootPath, '.gitignore'), 'utf8')).resolves.toMatch(/^node_modules\/\r\n# BEGIN MD²/u);
    });

    it('re-includes the project folder by removing only the managed entry and keeps .gitignore', async () => {
        const runGitProcess = mockGit('');
        await writeFile(join(rootPath, '.gitignore'), `${MANAGED_BLOCK_BEGIN}\n/design/\n# END MD² local-only project folder\n`);

        await saveProjectFolderGitInclusionNow(project, { includeProjectFolderInGit: true, projectFolder: 'design' }, false);

        await expect(readFile(join(rootPath, '.gitignore'), 'utf8')).resolves.toBe('');
        expect(gitArguments(runGitProcess).some((args) => args.includes('design'))).toBe(false);
    });

    it('rejects keeping the repository root out of Git', async () => {
        mockGit('');

        await expect(saveProjectFolderGitInclusionNow(project, { includeProjectFolderInGit: false, projectFolder: '' }, true))
            .rejects.toThrow('The repository root cannot be kept out of Git');
    });

    it('reports whether Git tracks files below the project folder', async () => {
        mockGit('design/active/F-1.md\0');

        await expect(hasTrackedProjectFolderFiles(project, 'design')).resolves.toBe(true);
    });
});
