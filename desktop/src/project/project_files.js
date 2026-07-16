const fs = require('node:fs');
const path = require('node:path');

const {
    assertGitRoot,
    commitStagedChanges,
    ensureInsideRoot,
    pathExists,
    requireRootPath,
    runGit,
} = require('../git/git_commands');
const { normalizePath } = require('../../../shared/path_utils.mjs');

const MARKDOWN_EXTENSION = '.md';
const JSON_EXTENSION = '.json';
const PROJECT_CONFIG_PATH = 'md2.config.json';
const GIT_FOLDER = '.git';
const PROJECT_README_TEMPLATE = '# MD²\n\nProject design folder created by MD².\n';
const PROJECT_ASSET_CONTENT_TYPES = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

async function readMarkdownFiles(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            files.push(...await readMarkdownFiles(rootPath, entryPath));
            continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
            const content = await fs.promises.readFile(entryPath, 'utf8');
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) });
        }
    }

    return files;
}

async function readRootMarkdownFiles(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
            const entryPath = path.join(folderPath, entry.name);
            const content = await fs.promises.readFile(entryPath, 'utf8');
            files.push({ content, path: normalizePath(path.relative(rootPath, entryPath)) });
        }
    }

    return files;
}

async function readRepositoryFilePaths(rootPath, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name === GIT_FOLDER) continue;

        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            files.push(...await readRepositoryFilePaths(rootPath, entryPath));
            continue;
        }

        if (entry.isFile()) files.push(normalizePath(path.relative(rootPath, entryPath)));
    }

    return files;
}

async function readTopLevelFolders(rootPath) {
    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isDirectory() && entry.name !== GIT_FOLDER)
        .map((entry) => ({ name: entry.name, path: normalizePath(entry.name) }))
        .sort((left, right) => left.path.localeCompare(right.path));
}

function createMissingWorkingFolderError(workingFolder) {
    const error = new Error(`Working folder is missing: ${workingFolder}`);
    error.code = 'missing-working-folder';
    error.workingFolder = workingFolder;

    return error;
}

async function createProject(project, workingFolder) {
    return createWorkingFolderFromTemplate(project, workingFolder);
}

async function createWorkingFolderFromTemplate(project, workingFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder));

    if (!await pathExists(workingFolderPath)) {
        await fs.promises.mkdir(workingFolderPath, { recursive: true });
        await fs.promises.writeFile(path.join(workingFolderPath, 'README.md'), PROJECT_README_TEMPLATE);
        await runGit(rootPath, ['add', workingFolder]);
        await commitStagedChanges(rootPath, `Create ${workingFolder} workspace`);
    }

    return project;
}

async function loadProject(project, workingFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder));

    if (!await pathExists(workingFolderPath)) {
        throw createMissingWorkingFolderError(workingFolder);
    }

    return {
        files: await readMarkdownFiles(rootPath, workingFolderPath),
        workingFolder,
    };
}

async function loadProjectRoot(project, workingFolder) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const workingFolderPath = ensureInsideRoot(rootPath, path.join(rootPath, workingFolder));

    if (!await pathExists(workingFolderPath)) {
        throw createMissingWorkingFolderError(workingFolder);
    }

    return {
        files: await readRootMarkdownFiles(rootPath, workingFolderPath),
        workingFolder,
    };
}

async function loadFile(project, filePath) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('Missing file path');
    if (!filePath.toLowerCase().endsWith(MARKDOWN_EXTENSION)) throw new Error('Only markdown files can be loaded this way');

    const fullPath = ensureInsideRoot(rootPath, path.join(rootPath, filePath));
    const content = await fs.promises.readFile(fullPath, 'utf8');

    return { content, path: normalizePath(path.relative(rootPath, fullPath)) };
}

async function loadProjectAsset(project, filePath) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('Missing project asset path');

    const extension = path.extname(filePath).toLowerCase();
    const contentType = PROJECT_ASSET_CONTENT_TYPES[extension];
    if (!contentType) throw new Error(`Unsupported project asset type: ${extension}`);

    const fullPath = ensureInsideRoot(rootPath, path.join(rootPath, filePath));
    const content = await fs.promises.readFile(fullPath);

    return {
        content: content.toString('base64'),
        contentType,
        encoding: 'base64',
        path: normalizePath(path.relative(rootPath, fullPath)),
    };
}

async function loadProjectConfig(project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const configPath = ensureInsideRoot(rootPath, path.join(rootPath, PROJECT_CONFIG_PATH));
    if (!await pathExists(configPath)) return null;

    const content = await fs.promises.readFile(configPath, 'utf8');

    return JSON.parse(content);
}

async function listRepositoryFiles(project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const files = await readRepositoryFilePaths(rootPath, rootPath);

    return files.sort((left, right) => left.localeCompare(right));
}

async function listTopLevelFolders(project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);

    return readTopLevelFolders(rootPath);
}

async function commit(request, project) {
    const rootPath = requireRootPath(project);

    for (const file of request.files) {
        const filePath = ensureInsideRoot(rootPath, path.join(rootPath, file.path));
        const data = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, data);
        await runGit(rootPath, ['add', file.path]);
    }

    await commitStagedChanges(rootPath, request.message);
}

async function deleteFile(request, project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.message !== 'string' || request.message.length === 0) throw new Error('Missing delete commit message');
    if (typeof request.path !== 'string' || request.path.length === 0) throw new Error('Missing delete file path');

    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, request.path));
    const repositoryPath = normalizePath(path.relative(rootPath, filePath));
    await runGit(rootPath, ['rm', repositoryPath]);
    await runGit(rootPath, ['commit', '-m', request.message]);
}

async function deleteFolder(request, project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.message !== 'string' || request.message.length === 0) throw new Error('Missing delete commit message');
    if (typeof request.path !== 'string' || request.path.length === 0) throw new Error('Missing delete folder path');

    const folderPath = ensureInsideRoot(rootPath, path.join(rootPath, request.path));
    const repositoryPath = normalizePath(path.relative(rootPath, folderPath));
    await runGit(rootPath, ['rm', '-r', repositoryPath]);
    await runGit(rootPath, ['commit', '-m', request.message]);
}

async function moveFiles(request, project) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    if (!request || typeof request.message !== 'string' || request.message.length === 0) throw new Error('Missing move commit message');
    if (!Array.isArray(request.moves) || request.moves.length === 0) throw new Error('Missing files to move');

    for (const move of request.moves) {
        if (!move || typeof move.fromPath !== 'string' || move.fromPath.length === 0) throw new Error('Missing move source path');
        if (typeof move.toPath !== 'string' || move.toPath.length === 0) throw new Error('Missing move target path');
        if (typeof move.content !== 'string') throw new Error('Missing move content');

        const sourcePath = ensureInsideRoot(rootPath, path.join(rootPath, move.fromPath));
        const targetPath = ensureInsideRoot(rootPath, path.join(rootPath, move.toPath));
        const targetRepositoryPath = normalizePath(path.relative(rootPath, targetPath));
        const data = move.encoding === 'base64' ? Buffer.from(move.content, 'base64') : move.content;
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await runGit(rootPath, ['mv', normalizePath(path.relative(rootPath, sourcePath)), targetRepositoryPath]);
        await fs.promises.writeFile(targetPath, data);
        await runGit(rootPath, ['add', targetRepositoryPath]);
    }

    await runGit(rootPath, ['commit', '-m', request.message]);
}

async function saveProjectConfig(project, config) {
    const rootPath = requireRootPath(project);
    await assertGitRoot(rootPath);
    const configPath = ensureInsideRoot(rootPath, path.join(rootPath, PROJECT_CONFIG_PATH));
    await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    await runGit(rootPath, ['add', PROJECT_CONFIG_PATH]);
    await commitStagedChanges(rootPath, 'Update MD² project config');
}

function watchChangeKind(rootPath, eventType, normalizedPath) {
    if (eventType === 'change') return 'changed';
    if (eventType !== 'rename') return 'unknown';

    const targetPath = ensureInsideRoot(rootPath, path.join(rootPath, normalizedPath));

    return fs.existsSync(targetPath) ? 'added' : 'removed';
}

function watchProject(project, onChange) {
    const rootPath = requireRootPath(project);
    const watcher = fs.watch(rootPath, { recursive: true }, (eventType, fileName) => {
        if (typeof fileName !== 'string') return;

        const normalizedPath = normalizePath(fileName);
        const lowerPath = normalizedPath.toLowerCase();
        if (lowerPath.endsWith(MARKDOWN_EXTENSION) || lowerPath.endsWith(JSON_EXTENSION)) {
            onChange({ changeKind: watchChangeKind(rootPath, eventType, normalizedPath), path: normalizedPath });
        }
    });

    return () => watcher.close();
}

module.exports = {
    commit,
    createProject,
    createWorkingFolderFromTemplate,
    deleteFile,
    deleteFolder,
    listRepositoryFiles,
    listTopLevelFolders,
    loadFile,
    loadProject,
    loadProjectAsset,
    loadProjectConfig,
    loadProjectRoot,
    moveFiles,
    PROJECT_README_TEMPLATE,
    saveProjectConfig,
    watchProject,
};
