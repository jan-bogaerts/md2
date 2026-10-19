const path = require('node:path');

function projectKey(rootPath) {
    const normalized = path.normalize(path.resolve(rootPath));

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** Serializes repository-wide operations that must not overlap for one project. */
class ProjectOperationCoordinator {
    constructor() {
        this.operationQueues = new Map();
    }

    run(rootPath, operation) {
        if (typeof rootPath !== 'string' || rootPath.length === 0) throw new Error('Missing project operation rootPath');
        if (typeof operation !== 'function') throw new Error('Missing project operation');
        const key = projectKey(rootPath);
        const previous = this.operationQueues.get(key) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        const queueTail = current.catch(() => undefined);
        this.operationQueues.set(key, queueTail);
        void queueTail.finally(() => {
            if (this.operationQueues.get(key) === queueTail) this.operationQueues.delete(key);
        });

        return current;
    }
}

const projectOperationCoordinator = new ProjectOperationCoordinator();

module.exports = { ProjectOperationCoordinator, projectKey, projectOperationCoordinator };
