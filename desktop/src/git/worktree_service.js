const fs = require('node:fs');
const path = require('node:path');

const PARKING_BRANCH_PREFIX = 'md2/parking/';

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

function requireProjectBranch(project) {
    if (!project || typeof project.branch !== 'string' || project.branch.length === 0) throw new Error('Missing project branch');

    return project.branch;
}

function parseRevisionCounts(output) {
    const values = output.trim().split(/\s+/u).map((value) => Number.parseInt(value, 10));
    if (values.length !== 2 || values.some((value) => !Number.isInteger(value))) {
        throw new Error(`Invalid Git revision counts: ${output}`);
    }

    return { ahead: values[0], behind: values[1] };
}

class WorktreeService {
    constructor(dependencies) {
        this.runGit = dependencies.runGit;
    }

    async load(project) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const worktrees = parseWorktreeList(await this.runGit(primaryRoot, ['worktree', 'list', '--porcelain']));

        return Promise.all(worktrees.filter((worktree) => pathKey(path.resolve(worktree.path)) !== pathKey(primaryRoot)).map(async (worktree) => {
            const error = worktreeError(worktree);
            const resolvedPath = path.resolve(worktree.path);
            const parkingBranch = await this.parkingBranch(resolvedPath);
            const status = error === null
                ? await this.status(resolvedPath, worktree.branch, requireProjectBranch(project))
                : { ahead: 0, behind: 0, dirty: false, hasUpstream: false };

            return { branch: worktree.branch, error, parkingBranch, path: resolvedPath, status, valid: error === null };
        }));
    }

    async add(project, folderPath) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('Missing linked worktree folder');
        if (pathKey(path.resolve(folderPath)) === pathKey(primaryRoot)) throw new Error('Primary worktree cannot be added as a linked worktree');

        const resolvedFolder = path.resolve(folderPath);
        await this.runGit(primaryRoot, ['worktree', 'add', resolvedFolder]);
        await this.parkPath(project, resolvedFolder);

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

    /** Select or create a card branch in one linked worktree. */
    async prepare(project, index, branchName) {
        if (typeof branchName !== 'string' || branchName.length === 0) throw new Error('Missing worktree branch name');
        const projectBranch = requireProjectBranch(project);

        const record = await this.resolve(project, index);
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        await this.runGit(primaryRoot, ['check-ref-format', '--branch', branchName]);
        if (record.branch === branchName) return this.load(project);
        if (record.status.dirty) throw new Error(`Linked worktree has uncommitted changes: ${record.path}`);

        const branchExists = await this.branchExists(primaryRoot, branchName);
        const switchArguments = branchExists ? ['switch', branchName] : ['switch', '-c', branchName, projectBranch];
        await this.runGit(record.path, switchArguments);

        return this.load(project);
    }

    async commit(project, index, message) {
        if (typeof message !== 'string' || message.trim().length === 0) throw new Error('Missing worktree commit message');
        const record = await this.resolve(project, index);
        if (!record.status.dirty) throw new Error('Linked worktree has no changes to commit');

        await this.runGit(record.path, ['add', '-A']);
        await this.runGit(record.path, ['commit', '-m', message.trim()]);

        return this.load(project);
    }

    async push(project, index) {
        const record = await this.resolve(project, index);
        const upstream = await this.upstream(record.path, record.branch);
        if (upstream.length > 0) await this.runGit(record.path, ['push']);
        else {
            await this.runGit(record.path, ['remote', 'get-url', 'origin']);
            await this.runGit(record.path, ['push', '--set-upstream', 'origin', record.branch]);
        }

        return this.load(project);
    }

    async pull(project, index) {
        const record = await this.resolve(project, index);
        if (record.status.dirty) throw new Error(`Linked worktree has uncommitted changes: ${record.path}`);
        const upstream = await this.upstream(record.path, record.branch);
        if (upstream.length === 0) throw new Error(`Worktree branch has no configured upstream: ${record.branch}`);

        await this.runGit(record.path, ['pull', '--ff-only']);

        return this.load(project);
    }

    async discard(project, index) {
        const record = await this.resolve(project, index);
        await this.runGit(record.path, ['reset', '--hard', 'HEAD']);
        await this.runGit(record.path, ['clean', '-fd']);

        return this.load(project);
    }

    async park(project, index) {
        const record = await this.resolve(project, index);
        if (record.status.dirty) throw new Error(`Linked worktree has uncommitted changes: ${record.path}`);

        await this.parkPath(project, record.path);

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

    async branchExists(rootPath, branchName) {
        try {
            await this.runGit(rootPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);

            return true;
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 1) return false;

            throw error;
        }
    }

    async parkingBranch(folderPath) {
        const gitDirectory = await this.runGit(folderPath, ['rev-parse', '--git-dir']);
        const worktreeId = path.basename(path.normalize(gitDirectory)).toLowerCase().replace(/[^a-z0-9._-]+/gu, '-');
        if (worktreeId.length === 0) throw new Error(`Cannot determine parking branch for worktree: ${folderPath}`);

        return `${PARKING_BRANCH_PREFIX}${worktreeId}`;
    }

    async parkPath(project, folderPath) {
        const projectBranch = requireProjectBranch(project);
        const parkingBranch = await this.parkingBranch(folderPath);
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        await this.runGit(primaryRoot, ['check-ref-format', '--branch', parkingBranch]);
        await this.runGit(folderPath, ['switch', '-C', parkingBranch, projectBranch]);
    }

    async status(folderPath, branch, projectBranch) {
        const dirty = (await this.runGit(folderPath, ['status', '--porcelain'])).length > 0;
        const upstream = await this.upstream(folderPath, branch);
        if (upstream.length === 0) {
            const aheadOutput = await this.runGit(folderPath, ['rev-list', '--count', `${projectBranch}..HEAD`]);
            const ahead = Number.parseInt(aheadOutput, 10);
            if (!Number.isInteger(ahead)) throw new Error(`Invalid Git ahead count: ${aheadOutput}`);

            return { ahead, behind: 0, dirty, hasUpstream: false };
        }

        const counts = parseRevisionCounts(await this.runGit(folderPath, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]));

        return { ...counts, dirty, hasUpstream: true };
    }

    upstream(folderPath, branch) {
        return this.runGit(folderPath, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`]);
    }

    static async requirePrimaryRoot(project) {
        if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
            throw new Error('Missing primary project rootPath');
        }

        return canonicalPath(project.rootPath);
    }
}

module.exports = { WorktreeService, parseWorktreeList };
