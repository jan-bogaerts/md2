const fs = require('node:fs');
const path = require('node:path');

function pathKey(folderPath) {
    const normalized = path.normalize(folderPath);

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function worktreeError(worktree) {
    if (worktree.locked) return `Worktree is locked: ${worktree.locked}`;
    if (worktree.prunable) return `Worktree is prunable: ${worktree.prunable}`;
    if (worktree.detached || !worktree.branch) return 'Worktree has detached HEAD; a named branch is required';

    return null;
}

async function canonicalPath(folderPath) {
    return path.resolve(await fs.promises.realpath(folderPath));
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

class WorktreeService {
    constructor(dependencies) {
        this.runGit = dependencies.runGit;
    }

    async load(project) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const worktrees = parseWorktreeList(await this.runGit(primaryRoot, ['worktree', 'list', '--porcelain']));

        return worktrees.filter((worktree) => pathKey(path.resolve(worktree.path)) !== pathKey(primaryRoot)).map((worktree) => {
            const error = worktreeError(worktree);

            return { branch: worktree.branch, error, path: path.resolve(worktree.path), valid: error === null };
        });
    }

    async add(project, folderPath) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('Missing linked worktree folder');
        if (pathKey(path.resolve(folderPath)) === pathKey(primaryRoot)) throw new Error('Primary worktree cannot be added as a linked worktree');

        await this.runGit(primaryRoot, ['worktree', 'add', path.resolve(folderPath)]);

        return this.load(project);
    }

    async remove(project, folderPath) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('Missing linked worktree folder');
        const resolvedFolder = path.resolve(folderPath);
        if (pathKey(resolvedFolder) === pathKey(primaryRoot)) throw new Error('Primary worktree cannot be removed');
        const worktrees = await this.load(project);
        if (!worktrees.some((worktree) => pathKey(worktree.path) === pathKey(resolvedFolder))) {
            throw new Error('Folder is not a linked worktree');
        }

        await this.runGit(primaryRoot, ['worktree', 'remove', resolvedFolder]);

        return this.load(project);
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
        if (!record) throw new Error('Execution repository root is not a linked worktree');
        if (!record.valid) throw new Error(`Execution repository root is invalid: ${record.error}`);

        return record;
    }

    static async requirePrimaryRoot(project) {
        if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
            throw new Error('Missing primary project rootPath');
        }

        return canonicalPath(project.rootPath);
    }
}

module.exports = { WorktreeService, parseWorktreeList };
