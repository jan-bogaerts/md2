const { execFile } = require('node:child_process');

const { terminateProcessTree } = require('../actions/process_tree');

const LOCAL_GIT_TIMEOUT_MS = 30_000;
const NETWORK_GIT_TIMEOUT_MS = 300_000;
const NETWORK_GIT_COMMANDS = new Set(['fetch', 'pull', 'push']);

function gitCommandName(args) {
    const command = args.find((argument) => NETWORK_GIT_COMMANDS.has(argument));

    return command ?? args.find((argument) => !argument.startsWith('-')) ?? 'unknown';
}

function gitTimeoutPolicy(args) {
    const command = gitCommandName(args);
    const network = NETWORK_GIT_COMMANDS.has(command);

    return {
        operation: `desktop Git ${command}`,
        timeoutMs: network ? NETWORK_GIT_TIMEOUT_MS : LOCAL_GIT_TIMEOUT_MS,
    };
}

function formatGitCommand(args) {
    return ['git', ...args].map((argument) => JSON.stringify(argument)).join(' ');
}

class GitProcess {
    constructor(options, dependencies = {}) {
        if (typeof options.rootPath !== 'string' || options.rootPath.length === 0) throw new Error('Missing Git process working directory');
        if (!Array.isArray(options.args) || options.args.length === 0) throw new Error('Missing Git process arguments');
        if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('Invalid Git process timeout');
        this.args = options.args;
        this.child = null;
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.execFile = dependencies.execFile ?? execFile;
        this.maxBuffer = options.maxBuffer;
        this.now = dependencies.now ?? Date.now;
        this.operation = options.operation;
        this.reject = null;
        this.resolve = null;
        this.rootPath = options.rootPath;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.settled = false;
        this.startedAt = null;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.timedOut = false;
        this.timeout = null;
        this.timeoutMs = options.timeoutMs;
        this.handleComplete = this.handleComplete.bind(this);
        this.handleTimeout = this.handleTimeout.bind(this);
    }

    run() {
        if (this.startedAt !== null) throw new Error('Git process already started');
        this.startedAt = this.now();
        const promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
        const executionOptions = { cwd: this.rootPath, detached: process.platform !== 'win32', windowsHide: true };
        if (this.maxBuffer !== undefined) executionOptions.maxBuffer = this.maxBuffer;
        try {
            this.child = this.execFile('git', this.args, executionOptions, this.handleComplete);
            this.timeout = this.setTimeout(this.handleTimeout, this.timeoutMs);
        } catch (error) {
            this.settleError(error);
        }

        return promise;
    }

    handleComplete(error, stdout, stderr) {
        if (this.settled || this.timedOut) return;
        if (error) {
            this.settleError(error);
            return;
        }

        this.settleSuccess({ stderr, stdout });
    }

    async handleTimeout() {
        if (this.settled || this.timedOut) return;
        this.timedOut = true;
        const elapsedMs = this.now() - this.startedAt;
        try {
            await this.terminateProcessTree(this.child);
        } catch {
            // Timeout error remains authoritative and includes process context.
        }
        const error = new Error(
            `Git command timed out: command=${formatGitCommand(this.args)} cwd=${JSON.stringify(this.rootPath)} `
            + `elapsedMs=${elapsedMs} operation=${JSON.stringify(this.operation)}`,
        );
        error.code = 'GIT_TIMEOUT';
        error.command = ['git', ...this.args];
        error.cwd = this.rootPath;
        error.elapsedMs = elapsedMs;
        error.operation = this.operation;
        this.settleError(error);
    }

    settleError(error) {
        if (this.settled) return;
        this.settled = true;
        if (this.timeout !== null) this.clearTimeout(this.timeout);
        this.reject(error);
    }

    settleSuccess(result) {
        if (this.settled) return;
        this.settled = true;
        if (this.timeout !== null) this.clearTimeout(this.timeout);
        this.resolve(result);
    }
}

module.exports = {
    GitProcess,
    formatGitCommand,
    LOCAL_GIT_TIMEOUT_MS,
    NETWORK_GIT_TIMEOUT_MS,
    gitTimeoutPolicy,
};
