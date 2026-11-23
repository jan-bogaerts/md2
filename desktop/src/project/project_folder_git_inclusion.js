const fs = require('node:fs');
const path = require('node:path');

const {
    assertGitRoot,
    commitStagedChanges,
    ensureInsideRoot,
    hasTrackedFiles,
    pathExists,
    requireRootPath,
    runGit,
} = require('../git/git_commands');
const { normalizePath } = require('../../../shared/path_utils.mjs');
const { holdProjectMutation, writeProjectConfigFile } = require('./project_files');
const { updateManagedIgnoreBlock } = require('./gitignore_managed_block');

const GITIGNORE_PATH = '.gitignore';
const INCLUSION_COMMIT_MESSAGE = 'Update MD² project folder Git inclusion';

/** Repository-relative project folder; an empty value is the repository root. */
function requireProjectFolderPath(rootPath, projectFolder) {
    if (typeof projectFolder !== 'string') throw new Error('Missing project folder');
    if (projectFolder.length === 0) return '';

    return normalizePath(path.relative(rootPath, ensureInsideRoot(rootPath, path.join(rootPath, projectFolder))));
}

/** Whether Git tracks any file below the configured project folder. */
async function hasTrackedProjectFolderFiles(project, projectFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const projectFolderPath = requireProjectFolderPath(rootPath, projectFolder);
    if (projectFolderPath.length === 0) throw new Error('The repository root cannot be kept out of Git');

    return hasTrackedFiles(rootPath, projectFolderPath);
}

async function readGitignore(gitignorePath) {
    if (!await pathExists(gitignorePath)) return '';

    return fs.promises.readFile(gitignorePath, 'utf8');
}

/** Rewrites the MD²-managed `.gitignore` block and stages the file when its content changed. */
async function updateGitignore(rootPath, ignoredProjectFolder) {
    const gitignorePath = ensureInsideRoot(rootPath, path.join(rootPath, GITIGNORE_PATH));
    const content = await readGitignore(gitignorePath);
    const nextContent = updateManagedIgnoreBlock(content, ignoredProjectFolder);
    if (nextContent === content) return;

    await fs.promises.writeFile(gitignorePath, nextContent);
    await runGit(rootPath, ['add', GITIGNORE_PATH]);
}

async function saveProjectFolderGitInclusionNow(project, config, removeTrackedFiles) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!config || typeof config !== 'object') throw new Error('Missing project config');
    if (typeof config.includeProjectFolderInGit !== 'boolean') throw new Error('Missing project config field: includeProjectFolderInGit');

    const projectFolderPath = requireProjectFolderPath(rootPath, config.projectFolder);
    const excluded = !config.includeProjectFolderInGit;
    if (excluded && projectFolderPath.length === 0) throw new Error('The repository root cannot be kept out of Git');
    if (excluded && await hasTrackedFiles(rootPath, projectFolderPath)) {
        if (!removeTrackedFiles) throw new Error(`Git still tracks files in ${projectFolderPath}; confirm their removal from the Git index first`);

        await runGit(rootPath, ['rm', '-r', '--cached', '--quiet', '--', projectFolderPath]);
    }

    await writeProjectConfigFile(rootPath, config);
    await updateGitignore(rootPath, excluded ? projectFolderPath : null);
    await commitStagedChanges(rootPath, INCLUSION_COMMIT_MESSAGE);
}

/**
 * Saves the project config together with the matching `.gitignore` entry. Excluding a project folder
 * that Git still tracks requires `removeTrackedFiles`, which removes those files from the index only.
 */
function saveProjectFolderGitInclusion(project, config, removeTrackedFiles) {
    const rootPath = requireRootPath(project);

    return holdProjectMutation(rootPath, () => saveProjectFolderGitInclusionNow(project, config, removeTrackedFiles === true));
}

module.exports = { hasTrackedProjectFolderFiles, saveProjectFolderGitInclusion, saveProjectFolderGitInclusionNow };
