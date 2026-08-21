const crossSpawn = require('cross-spawn');
const { JsonLineBuffer } = require('./agent_event_utils');
const { terminateProcessTree } = require('../process_tree');

const CODEX_USAGE_POLL_TIMEOUT_MS = 20_000;
const CODEX_USAGE_INITIALIZE_REQUEST_ID = 1;
const CODEX_USAGE_READ_REQUEST_ID = 2;

function writeJsonLine(stream, message) {
    return new Promise((resolve, reject) => {
        stream.write(`${JSON.stringify(message)}\n`, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function hasRateLimits(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const hasSingleBucket = !!payload.rateLimits && typeof payload.rateLimits === 'object' && !Array.isArray(payload.rateLimits);
    const hasBuckets = !!payload.rateLimitsByLimitId
        && typeof payload.rateLimitsByLimitId === 'object'
        && !Array.isArray(payload.rateLimitsByLimitId)
        && Object.keys(payload.rateLimitsByLimitId).length > 0;

    return hasSingleBucket || hasBuckets;
}

/** Reads Codex account rate limits once without creating a thread or turn. */
class CodexUsagePoller {
    constructor(dependencies = {}) {
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.now = dependencies.now ?? Date.now;
        this.onRuntimeEvent = dependencies.onRuntimeEvent;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.timeoutMs = dependencies.timeoutMs ?? CODEX_USAGE_POLL_TIMEOUT_MS;
        this.activePoll = null;
        this.child = null;
        this.lineBuffer = null;
        this.observedAt = null;
        this.pollResolve = null;
        this.protocolHandling = Promise.resolve();
        this.settled = false;
        this.stopped = false;
        this.timeout = null;
        if (typeof this.onRuntimeEvent !== 'function') throw new Error('Codex usage poller requires a runtime event listener');
    }

    requestPoll({ argumentsList = [], cwd = process.cwd(), env = process.env, executable, observedAt = this.now() } = {}) {
        if (typeof executable !== 'string' || executable.trim().length === 0) {
            throw new Error('Codex usage poll requires an executable');
        }
        if (!Array.isArray(argumentsList)) throw new Error('Codex usage poll requires an argument list');
        if (this.stopped || this.activePoll) return;

        const poll = this.poll({ argumentsList, cwd, env, executable, observedAt });
        this.activePoll = poll;
        void poll.finally(() => {
            if (this.activePoll === poll) this.activePoll = null;
        });
    }

    stop() {
        this.stopped = true;
        if (!this.activePoll) return Promise.resolve();

        return this.finish(null);
    }

    poll({ argumentsList, cwd, env, executable, observedAt }) {
        this.observedAt = observedAt;
        this.settled = false;
        this.protocolHandling = Promise.resolve();
        const poll = new Promise((resolve) => {
            this.pollResolve = resolve;
        });

        try {
            this.child = this.spawn(executable, [...argumentsList, 'app-server', '--stdio'], {
                cwd,
                detached: process.platform !== 'win32',
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.lineBuffer = new JsonLineBuffer('codex:usage', (line) => this.queueLine(line));
            this.child.stdin?.on('error', () => undefined);
            this.child.stdout?.on('error', () => undefined);
            this.child.stderr?.on('error', () => undefined);
            this.child.stdout?.on('data', (chunk) => this.lineBuffer.push(chunk));
            this.child.stderr?.resume();
            this.child.on('error', () => void this.finishUnavailable());
            this.child.on('close', () => this.handleClose());
            this.timeout = this.setTimeout(() => void this.finishUnavailable(), this.timeoutMs);
            void this.sendInitialize();
        } catch {
            void this.finishUnavailable();
        }

        return poll;
    }

    async sendInitialize() {
        try {
            await writeJsonLine(this.child.stdin, {
                id: CODEX_USAGE_INITIALIZE_REQUEST_ID,
                method: 'initialize',
                params: {
                    capabilities: { experimentalApi: true },
                    clientInfo: { name: 'md2', version: '1' },
                },
            });
        } catch {
            await this.finishUnavailable();
        }
    }

    queueLine(line) {
        this.protocolHandling = this.protocolHandling
            .then(() => this.handleLine(line))
            .catch(() => this.finishUnavailable());
    }

    async handleLine(line) {
        const message = JSON.parse(line);
        if (message.id === CODEX_USAGE_INITIALIZE_REQUEST_ID) {
            if (message.error || !message.result || typeof message.result !== 'object') {
                await this.finishUnavailable();
                return;
            }
            await writeJsonLine(this.child.stdin, { method: 'initialized', params: {} });
            await writeJsonLine(this.child.stdin, {
                id: CODEX_USAGE_READ_REQUEST_ID,
                method: 'account/rateLimits/read',
            });
            return;
        }
        if (message.id !== CODEX_USAGE_READ_REQUEST_ID) return;
        if (message.error || !hasRateLimits(message.result)) {
            await this.finishUnavailable();
            return;
        }
        await this.finish({ kind: 'snapshot', observedAt: this.observedAt, payload: message.result });
    }

    handleClose() {
        this.lineBuffer?.finish();
        void this.protocolHandling.then(() => this.finishUnavailable());
    }

    finishUnavailable() {
        return this.finish({ kind: 'unavailable', observedAt: this.observedAt });
    }

    async finish(event) {
        if (this.settled) return this.activePoll ?? Promise.resolve();
        this.settled = true;
        if (this.timeout) this.clearTimeout(this.timeout);
        this.timeout = null;
        const child = this.child;
        this.child = null;
        const completion = this.pollResolve;
        this.pollResolve = null;
        const termination = child
            ? this.terminateProcessTree(child).catch(() => undefined)
            : Promise.resolve();
        if (!this.stopped && event) await this.onRuntimeEvent(event);
        await termination;
        completion?.();
    }
}

module.exports = { CODEX_USAGE_POLL_TIMEOUT_MS, CodexUsagePoller };
