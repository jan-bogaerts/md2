const fs = require('node:fs');
const path = require('node:path');

const WORKTREES_FILE = '.md2-worktrees.json';
const WORKTREES_IGNORE_ENTRY = '/.md2-worktrees.json';

function pathKey(folderPath) {
    const normalized = path.normalize(folderPath);

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function gitErrorMessage(error) {
    if (error && typeof error === 'object' && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
        return error.stderr.trim();
    }
    if (error instanceof Error) return error.message;

    return 'Unknown Git error';
}

async function canonicalPath(folderPath) {
    return path.resolve(await fs.promises.realpath(folderPath));
}

async function canonicalGitPath(rootPath, gitPath) {
    return canonicalPath(path.resolve(rootPath, gitPath));
}

function parseWorktreeList(output) {
    return output.split(/\r?\n\r?\n/u).filter((block) => block.trim().length > 0).map((block) => {
        const lines = block.split(/\r?\n/u);
        const values = Object.fromEntries(lines.map((line) => {
            const separatorIndex = line.indexOf(' ');

            return separatorIndex === -1 ? [line, ''] : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
        }));

        return {
            branch: values.branch?.replace(/^refs\/heads\//u, '') ?? null,
            detached: Object.hasOwn(values, 'detached'),
            locked: Object.hasOwn(values, 'locked') ? values.locked || 'locked' : null,
            path: values.worktree,
            prunable: Object.hasOwn(values, 'prunable') ? values.prunable || 'prunable' : null,
        };
    });
}

function requireFolderList(value) {
    if (!Array.isArray(value)) throw new Error(`${WORKTREES_FILE} must contain a JSON array`);

    return value.map((folderPath, index) => {
        if (typeof folderPath !== 'string' || folderPath.length === 0) {
            throw new Error(`${WORKTREES_FILE} entry ${index + 1} must be a folder path string`);
        }

        return folderPath;
    });
}

async function ensureWorktreesIgnored(primaryRoot) {
    const ignorePath = path.join(primaryRoot, '.gitignore');
    let content = '';
    try {
        content = await fs.promises.readFile(ignorePath, 'utf8');
    } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    }
    const lines = content.split(/\r?\n/u);
    if (lines.includes(WORKTREES_IGNORE_ENTRY)) return;

    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await fs.promises.writeFile(ignorePath, `${content}${separator}${WORKTREES_IGNORE_ENTRY}\n`);
}

async function readStoredFolders(primaryRoot) {
    const filePath = path.join(primaryRoot, WORKTREES_FILE);
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');

        return requireFolderList(JSON.parse(content));
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
        if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${WORKTREES_FILE}: ${error.message}`, { cause: error });

        throw error;
    }
}

class WorktreeService {
    constructor(dependencies) {
        this.runGit = dependencies.runGit;
    }

    async load(project) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        await ensureWorktreesIgnored(primaryRoot);
        const folders = await readStoredFolders(primaryRoot);

        return this.validateStoredFolders(primaryRoot, folders);
    }

    async save(project, folders) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const folderList = requireFolderList(folders);
        await ensureWorktreesIgnored(primaryRoot);
        const existingFolders = await readStoredFolders(primaryRoot);
        const records = await this.validateStoredFolders(primaryRoot, folderList);
        const existingKeys = new Set(existingFolders.map((folderPath) => pathKey(path.resolve(folderPath))));
        const invalidRecord = records.find((record) => !record.valid && !existingKeys.has(pathKey(record.path)));
        if (invalidRecord) throw new Error(`Cannot save invalid worktree "${invalidRecord.path}": ${invalidRecord.error}`);

        await fs.promises.writeFile(path.join(primaryRoot, WORKTREES_FILE), `${JSON.stringify(records.map((record) => record.path), null, 2)}\n`);

        return records;
    }

    async validateForAdd(project, folderPath, registeredFolders = []) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const record = await this.validateFolder(primaryRoot, folderPath, registeredFolders);
        if (!record.valid) throw new Error(record.error);

        return record;
    }

    async resolve(project, index) {
        if (!Number.isInteger(index) || index <= 0) throw new Error(`Invalid card worktree index: ${String(index)}`);

        const records = await this.load(project);
        const record = records[index - 1];
        if (!record) throw new Error(`Configured worktree ${index} does not exist`);
        if (!record.valid) throw new Error(`Configured worktree ${index} is invalid: ${record.error}`);

        return record;
    }

    async resolvePath(project, folderPath) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const canonicalFolder = await canonicalPath(folderPath);
        if (pathKey(primaryRoot) === pathKey(canonicalFolder)) {
            return { branch: project.branch, error: null, path: primaryRoot, valid: true };
        }

        const records = await this.load(project);
        const record = records.find((candidate) => pathKey(candidate.path) === pathKey(canonicalFolder));
        if (!record) throw new Error('Execution repository root is not a registered worktree');
        if (!record.valid) throw new Error(`Execution repository root is invalid: ${record.error}`);

        return record;
    }

    async validateStoredFolders(primaryRoot, folders) {
        const records = [];
        const registeredFolders = [];
        for (const folderPath of folders) {
            const record = await this.validateFolder(primaryRoot, folderPath, registeredFolders);
            records.push(record);
            registeredFolders.push(record.path);
        }

        return records;
    }

    async validateFolder(primaryRoot, folderPath, registeredFolders) {
        try {
            const canonicalFolder = await canonicalPath(folderPath);
            const topLevel = await canonicalPath(await this.runGit(canonicalFolder, ['rev-parse', '--show-toplevel']));
            if (pathKey(topLevel) !== pathKey(canonicalFolder)) throw new Error('Selected folder is not a worktree root');
            if (pathKey(canonicalFolder) === pathKey(primaryRoot)) throw new Error('Primary worktree cannot be registered as a linked worktree');
            if (registeredFolders.some((registeredFolder) => pathKey(registeredFolder) === pathKey(canonicalFolder))) {
                throw new Error('Worktree folder is already registered');
            }

            const primaryCommonPath = await canonicalGitPath(primaryRoot, await this.runGit(primaryRoot, ['rev-parse', '--git-common-dir']));
            const linkedCommonPath = await canonicalGitPath(canonicalFolder, await this.runGit(canonicalFolder, ['rev-parse', '--git-common-dir']));
            if (pathKey(primaryCommonPath) !== pathKey(linkedCommonPath)) {
                throw new Error('Selected folder does not share the primary repository Git common directory');
            }

            const worktrees = parseWorktreeList(await this.runGit(primaryRoot, ['worktree', 'list', '--porcelain']));
            const worktree = worktrees.find((candidate) => pathKey(path.resolve(candidate.path)) === pathKey(canonicalFolder));
            if (!worktree) throw new Error('Selected folder is not registered by Git as a linked worktree');
            if (worktree.locked) throw new Error(`Worktree is locked: ${worktree.locked}`);
            if (worktree.prunable) throw new Error(`Worktree is prunable: ${worktree.prunable}`);
            if (worktree.detached || !worktree.branch) throw new Error('Worktree has detached HEAD; a named branch is required');

            const primaryBranch = await this.runGit(primaryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
            if (primaryBranch === worktree.branch) throw new Error(`Branch "${worktree.branch}" is already checked out in the primary worktree`);
            const registeredKeys = new Set(registeredFolders.map((registeredFolder) => pathKey(registeredFolder)));
            const duplicateBranch = worktrees.find((candidate) => (
                candidate.branch === worktree.branch
                && pathKey(path.resolve(candidate.path)) !== pathKey(canonicalFolder)
                && registeredKeys.has(pathKey(path.resolve(candidate.path)))
            ));
            if (duplicateBranch) throw new Error(`Branch "${worktree.branch}" is already checked out in another registered worktree`);

            return { branch: worktree.branch, error: null, path: canonicalFolder, valid: true };
        } catch (error) {
            return { branch: null, error: gitErrorMessage(error), path: path.resolve(folderPath), valid: false };
        }
    }

    static async requirePrimaryRoot(project) {
        if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
            throw new Error('Missing primary project rootPath');
        }

        return canonicalPath(project.rootPath);
    }
}

module.exports = {
    WORKTREES_FILE,
    WORKTREES_IGNORE_ENTRY,
    WorktreeService,
    ensureWorktreesIgnored,
    parseWorktreeList,
    readStoredFolders,
};
