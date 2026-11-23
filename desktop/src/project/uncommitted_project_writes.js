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
        this.localOnlyFolderByRoot = new Map();
        this.pathExists = dependencies.pathExists ?? pathExists;
        this.pathsByRoot = new Map();
    }

    /** Sets config-owned Git inclusion policy for one repository root. */
    configure(rootPath, config) {
        if (!config || typeof config !== 'object') throw new Error('Missing project config');
        if (typeof config.projectFolder !== 'string') throw new Error('Missing project folder');
        const key = projectKey(rootPath);
        if (config.includeProjectFolderInGit !== false || config.projectFolder.length === 0) {
            this.localOnlyFolderByRoot.delete(key);
            return;
        }

        const localOnlyFolder = relativeRepositoryPath(rootPath, config.projectFolder);
        this.localOnlyFolderByRoot.set(key, localOnlyFolder);
        const pendingPaths = this.pathsByRoot.get(key);
        if (!pendingPaths) return;

        for (const repositoryPath of pendingPaths) {
            if (repositoryPath === localOnlyFolder || repositoryPath.startsWith(`${localOnlyFolder}/`)) {
                pendingPaths.delete(repositoryPath);
            }
        }
        if (pendingPaths.size === 0) this.pathsByRoot.delete(key);
    }

    /** Returns normalized paths whose active project configuration permits Git to persist. */
    gitPaths(rootPath, filePaths) {
        const localOnlyFolder = this.localOnlyFolderByRoot.get(projectKey(rootPath));

        return [...new Set(filePaths.map((filePath) => relativeRepositoryPath(rootPath, filePath)))]
            .filter((repositoryPath) => !localOnlyFolder
                || (repositoryPath !== localOnlyFolder && !repositoryPath.startsWith(`${localOnlyFolder}/`)));
    }

    /** Lists pending Git writes without mutating them. */
    pendingPaths(rootPath) {
        return [...(this.pathsByRoot.get(projectKey(rootPath)) ?? [])];
    }

    /** Clears paths after another commit persisted them successfully. */
    acknowledge(rootPath, filePaths) {
        const key = projectKey(rootPath);
        const paths = this.pathsByRoot.get(key);
        if (!paths) return;

        filePaths.map((filePath) => relativeRepositoryPath(rootPath, filePath)).forEach((filePath) => paths.delete(filePath));
        if (paths.size === 0) this.pathsByRoot.delete(key);
    }

    /** Records written files (absolute or root-relative) for the repository root. */
    mark(rootPath, filePaths) {
        const key = projectKey(rootPath);
        const paths = this.pathsByRoot.get(key) ?? new Set();
        this.gitPaths(rootPath, filePaths).forEach((filePath) => paths.add(filePath));
        if (paths.size === 0) return;
        this.pathsByRoot.set(key, paths);
    }

    /**
     * Commits every marked file of the root in one commit and clears them. Files removed since they were written
     * are dropped, because Git cannot stage a path that is neither on disk nor in the index.
     */
    async commit(rootPath) {
        const paths = this.pendingPaths(rootPath);
        if (paths.length === 0) return null;
        const existence = await Promise.all(paths.map((relativePath) => this.pathExists(path.join(rootPath, relativePath))));
        const existingPaths = paths.filter((_relativePath, index) => existence[index]);
        const commit = existingPaths.length > 0
            ? await this.commitTrackedPaths(rootPath, existingPaths, COMMIT_MESSAGE)
            : null;
        this.acknowledge(rootPath, paths);

        return commit;
    }
}

const uncommittedProjectWrites = new UncommittedProjectWrites();

module.exports = { UncommittedProjectWrites, uncommittedProjectWrites };
