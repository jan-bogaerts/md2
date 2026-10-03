const crossSpawn = require('cross-spawn');
const { StringDecoder } = require('node:string_decoder');
const { terminateProcessTree } = require('../process_tree');
const { redactSecrets } = require('./agent_secret_redaction');

const CATALOG_TIMEOUT_MS = 20_000;
const CATALOG_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const CATALOG_MAX_REQUESTS = 24;

/** Own one bounded, no-inference JSONL discovery process and its pending protocol requests. */
class AgentCatalogProcess {
    constructor(agent, dependencies = {}) {
        this.agent = agent;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.timeoutMs = dependencies.timeoutMs ?? CATALOG_TIMEOUT_MS;
        this.maximumOutputBytes = dependencies.maximumOutputBytes ?? CATALOG_MAX_OUTPUT_BYTES;
        this.child = null;
        this.closed = false;
        this.failure = null;
        this.buffer = '';
        this.decoder = new StringDecoder('utf8');
        this.secretValues = new Set();
        this.outputBytes = 0;
        this.requestSequence = 0;
        this.pending = new Map();
        this.timer = null;
        this.handleOutput = this.handleOutput.bind(this);
        this.handleStderr = this.handleStderr.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleExit = this.handleExit.bind(this);
        this.handleTimeout = this.handleTimeout.bind(this);
    }

    start(executable, argumentsList, options) {
        this.secretValues = new Set(Object.entries(options.env)
            .filter(([name, value]) => /token|secret|password|api.?key/iu.test(name) && typeof value === 'string' && value.length > 0)
            .map(([, value]) => value));
        this.child = this.spawn(executable, argumentsList, {
            ...options,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child.stdout.on('data', this.handleOutput);
        this.child.stderr.on('data', this.handleStderr);
        this.child.stdin.on('error', this.handleError);
        this.child.on('error', this.handleError);
        this.child.on('exit', this.handleExit);
        this.timer = setTimeout(this.handleTimeout, this.timeoutMs);
    }

    async request(method, params) {
        if (this.failure) throw this.failure;
        if (this.closed || !this.child) throw new Error('Agent catalog process is closed');
        if (this.requestSequence >= CATALOG_MAX_REQUESTS) throw new Error('Agent catalog request limit exceeded');
        this.requestSequence += 1;
        const identifier = this.requestSequence;
        const completion = Promise.withResolvers();
        this.pending.set(identifier, completion);
        const message = this.agent === 'codex'
            ? { id: identifier, method, params }
            : { type: 'control_request', request_id: String(identifier), request: { subtype: method, ...params } };
        try {
            this.write(message);
        } catch (error) {
            this.pending.delete(identifier);
            throw error;
        }

        return await completion.promise;
    }

    write(message) {
        if (!this.child || this.closed) throw new Error('Agent catalog process is closed');
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    countOutput(chunk) {
        this.outputBytes += Buffer.byteLength(chunk);
        if (this.outputBytes > this.maximumOutputBytes) {
            this.fail(new Error('Agent model discovery exceeded its output limit'));
            return false;
        }

        return true;
    }

    handleStderr(chunk) {
        this.countOutput(chunk);
    }

    handleOutput(chunk) {
        if (this.closed || this.failure || !this.countOutput(chunk)) return;
        this.buffer += this.decoder.write(chunk);
        const lines = this.buffer.split(/\r?\n/u);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim().length === 0) continue;
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                this.fail(new Error(`Malformed ${this.agent} model discovery response`));
                return;
            }
            try {
                this.handleMessage(message);
            } catch (error) {
                this.fail(error);
                return;
            }
        }
    }

    handleMessage(message) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            throw new Error('Malformed agent catalog protocol response');
        }
        if (this.agent === 'codex') {
            const completion = this.pending.get(message.id);
            if (!completion) return;
            this.pending.delete(message.id);
            if (message.error) {
                completion.reject(new Error(redactSecrets(message.error.message ?? 'Codex model discovery failed', this.secretValues)));
            }
            else if (Object.hasOwn(message, 'result')) completion.resolve(message.result);
            else completion.reject(new Error('Codex model discovery response is missing its result'));
            return;
        }
        if (message.type !== 'control_response') return;
        const response = message.response;
        if (!response || typeof response.request_id !== 'string') throw new Error('Malformed Claude catalog response');
        const completion = this.pending.get(Number(response.request_id));
        if (!completion) return;
        this.pending.delete(Number(response.request_id));
        if (response.subtype === 'error') {
            completion.reject(new Error(redactSecrets(response.error ?? 'Claude model discovery failed', this.secretValues)));
        }
        else if (response.subtype === 'success' && response.response) completion.resolve(response.response);
        else completion.reject(new Error('Claude model discovery response is missing its result'));
    }

    fail(error) {
        if (this.failure) return;
        this.failure = error;
        for (const completion of this.pending.values()) completion.reject(error);
        this.pending.clear();
    }

    handleError(error) {
        this.fail(new Error(`Could not read ${this.agent} model catalog: ${error.message}`));
    }

    handleExit(code) {
        if (!this.closed) this.fail(new Error(`${this.agent} model discovery exited before completing (code ${code})`));
    }

    handleTimeout() {
        this.fail(new Error(`${this.agent} model discovery timed out`));
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.timer);
        this.fail(new Error('Agent model discovery was cancelled'));
        await this.terminateProcessTree(this.child);
    }
}

module.exports = { AgentCatalogProcess };
