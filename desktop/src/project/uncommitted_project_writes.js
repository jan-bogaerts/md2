const path = require('node:path');

const { commitTrackedPaths, pathExists } = require('../git/git_commands');
const { projectKey } = require('./project_operation_coordinator');

const COMMIT_MESSAGE = 'Save pending project activity';

function relativeRepositoryPath(rootPath, filePath) {
    return path.relative(rootPath, path.resolve(rootPath, filePath)).replace(/\\/gu, '/');
}

/** Remembers primary-worktree files the desktop wrote without committing, so integration can commit them once. */
class UncommittedProjectWrites {
    constructor(dependencies = {}) {
        this.commitTrackedPaths = dependencies.commitTrackedPaths ?? commitTrackedPaths;
        this.pathExists = dependencies.pathExists ?? pathExists;
        this.pathsByRoot = new Map();
    }

    /** Records written files (absolute or root-relative) for the repository root. */
    mark(rootPath, filePaths) {
        const key = projectKey(rootPath);
        const paths = this.pathsByRoot.get(key) ?? new Set();
        filePaths.forEach((filePath) => paths.add(relativeRepositoryPath(rootPath, filePath)));
        this.pathsByRoot.set(key, paths);
    }

    /**
     * Commits every marked file of the root in one commit and clears them. Files removed since they were written
     * are dropped, because Git cannot stage a path that is neither on disk nor in the index.
     */
    async commit(rootPath) {
        const key = projectKey(rootPath);
        const paths = [...(this.pathsByRoot.get(key) ?? [])];
        if (paths.length === 0) return null;
        const existence = await Promise.all(paths.map((relativePath) => this.pathExists(path.join(rootPath, relativePath))));
        const existingPaths = paths.filter((_relativePath, index) => existence[index]);
        const commit = existingPaths.length > 0
            ? await this.commitTrackedPaths(rootPath, existingPaths, COMMIT_MESSAGE)
            : null;
        const remaining = this.pathsByRoot.get(key);
        paths.forEach((relativePath) => remaining?.delete(relativePath));
        if (remaining?.size === 0) this.pathsByRoot.delete(key);

        return commit;
    }
}

const uncommittedProjectWrites = new UncommittedProjectWrites();

module.exports = { UncommittedProjectWrites, uncommittedProjectWrites };
