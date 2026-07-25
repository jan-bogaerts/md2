const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const mutationQueues = new Map();

function indexKey(indexPath) {
    const normalized = path.normalize(indexPath);

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function resolveGitIndexPath(rootPath) {
    const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-path', 'index'],
        { cwd: rootPath },
    );
    const indexPath = stdout.trim();
    if (indexPath.length === 0) throw new Error(`Git returned no index path for ${rootPath}`);

    return path.resolve(rootPath, indexPath);
}

async function withGitIndexMutations(rootPaths, operation) {
    const resolvedRootPaths = [...new Set(rootPaths.map((rootPath) => path.resolve(rootPath)))];
    const resolvedIndexPaths = await Promise.all(resolvedRootPaths.map(resolveGitIndexPath));
    const keys = [...new Set(resolvedIndexPaths.map(indexKey))].sort();
    const previousMutations = keys.map((key) => mutationQueues.get(key) ?? Promise.resolve());
    const mutation = Promise.all(previousMutations).then(operation);
    const queueTail = mutation.catch(() => undefined);
    keys.forEach((key) => mutationQueues.set(key, queueTail));
    void queueTail.finally(() => {
        keys.forEach((key) => {
            if (mutationQueues.get(key) === queueTail) mutationQueues.delete(key);
        });
    });

    return mutation;
}

function withGitIndexMutation(rootPath, operation) {
    return withGitIndexMutations([rootPath], operation);
}

module.exports = { resolveGitIndexPath, withGitIndexMutation, withGitIndexMutations };
