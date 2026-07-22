const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 0;
const SOCKET_OPEN_STATE = 1;
const REMOTE_CONTROL_STOP_CODE = 1001;
const UNAUTHORIZED_STATUS = 401;
const NOT_FOUND_STATUS = 404;
const AGENT_EVENT_METHODS = new Set(['runSearchRegexpAgent']);
const STATIC_INDEX_FILE = 'index.html';
const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
};

function contentTypeFor(filePath) {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Maps a request URL path to an absolute file inside staticDir, or null when it escapes the root. */
function resolveStaticFile(staticDir, urlPath) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
    } catch {
        return null;
    }
    if (pathname === '/' || pathname === '') pathname = `/${STATIC_INDEX_FILE}`;

    const resolved = path.resolve(staticDir, `.${pathname}`);
    const root = path.resolve(staticDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

    return resolved;
}

function createInactiveState() {
    return {
        active: false,
        clientCount: 0,
        endpoint: null,
        hostnameEndpoint: null,
        ipEndpoints: [],
        token: null,
    };
}

function createToken() {
    return crypto.randomBytes(18).toString('base64url');
}

function isLoopbackHost(host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

// Virtual adapters (Hyper-V/WSL/VM bridges) report LAN-looking IPv4s that a phone on the real Wi-Fi
// cannot reach — Node does not flag them `internal`, so they slip past the loopback check. Exclude them
// so the fallback list only shows addresses a remote device can actually connect to.
const VIRTUAL_ADAPTER_PATTERN = /vethernet|virtualbox|vmware|hyper-v|\bwsl\b|loopback|\btap\b|npcap|bluetooth/iu;

/**
 * LAN-reachable IPv4 addresses, skipping internal (loopback), link-local (169.254.x) and virtual
 * (Hyper-V/WSL/VM) interfaces so only phone-reachable physical-adapter addresses are surfaced.
 */
function lanIpv4Addresses() {
    const addresses = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        if (VIRTUAL_ADAPTER_PATTERN.test(name)) continue;
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;
            if (entry.address.startsWith('169.254.')) continue;
            addresses.push(entry.address);
        }
    }

    return addresses;
}

function sendJson(socket, message) {
    if (socket.readyState !== SOCKET_OPEN_STATE) return;

    socket.send(JSON.stringify(message));
}

function closeUnauthorized(socket) {
    socket.write(`HTTP/1.1 ${UNAUTHORIZED_STATUS} Unauthorized\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

function errorMessage(error) {
    return error instanceof Error ? error.message : 'Remote-control request failed';
}

function protocolTokens(request) {
    const header = request.headers['sec-websocket-protocol'];
    if (typeof header !== 'string') return [];

    return header.split(',').map((token) => token.trim()).filter((token) => token.length > 0);
}

class RemoteControlService {
    constructor(dispatcher = null) {
        this.clientCount = 0;
        this.clients = new Set();
        this.dispatcher = dispatcher;
        this.host = DEFAULT_HOST;
        this.port = DEFAULT_PORT;
        this.server = null;
        this.staticDir = null;
        this.statusListener = null;
        this.subscriptions = new Map();
        this.token = null;
        this.websocketServer = null;
    }

    getStatus() {
        if (!this.server) return createInactiveState();

        const address = this.server.address();
        const port = address && typeof address === 'object' ? address.port : this.port;
        const loopback = isLoopbackHost(this.host);
        const hostnameEndpoint = loopback ? null : `ws://${os.hostname().toLowerCase()}.local:${port}`;
        const ipEndpoints = loopback ? [] : lanIpv4Addresses().map((ip) => `ws://${ip}:${port}`);

        return {
            active: true,
            clientCount: this.clientCount,
            endpoint: hostnameEndpoint ?? `ws://${this.host}:${port}`,
            hostnameEndpoint,
            ipEndpoints,
            token: this.token,
        };
    }

    async start(options = {}) {
        if (this.server) return this.getStatus();

        this.host = typeof options.host === 'string' && options.host.length > 0 ? options.host : DEFAULT_HOST;
        this.port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
        this.staticDir = typeof options.staticDir === 'string' && options.staticDir.length > 0 ? options.staticDir : null;
        this.token = typeof options.token === 'string' && options.token.length > 0 ? options.token : createToken();
        if (!isLoopbackHost(this.host) && !this.token) throw new Error('Remote-control token is required for non-loopback binds');

        await new Promise((resolve, reject) => {
            const server = http.createServer();
            const websocketServer = new WebSocketServer({ noServer: true });
            const service = this;

            function handleError(error) {
                server.off('listening', handleListening);
                service.token = null;
                reject(error);
            }

            function handleListening() {
                server.off('error', handleError);
                service.server = server;
                service.websocketServer = websocketServer;
                service.registerServerEvents(server, websocketServer);
                service.emitStatus();
                resolve();
            }

            server.once('error', handleError);
            server.once('listening', handleListening);
            server.listen(this.port, this.host);
        });

        return this.getStatus();
    }

    async stop() {
        if (!this.server) return createInactiveState();

        const server = this.server;
        const websocketServer = this.websocketServer;
        this.server = null;
        this.websocketServer = null;
        this.clientCount = 0;

        for (const client of this.clients) client.close(REMOTE_CONTROL_STOP_CODE, 'Remote control stopped');
        for (const client of this.clients) client.terminate();
        this.clients.clear();
        this.clearAllSubscriptions();

        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        if (websocketServer) websocketServer.close();
        this.token = null;
        this.emitStatus();

        return createInactiveState();
    }

    setStatusListener(listener) {
        this.statusListener = listener;
    }

    registerServerEvents(server, websocketServer) {
        server.on('request', (request, response) => {
            this.handleStaticRequest(request, response);
        });

        server.on('upgrade', (request, socket, head) => {
            if (!this.isAuthorized(request)) {
                closeUnauthorized(socket);
                return;
            }

            websocketServer.handleUpgrade(request, socket, head, (client) => {
                websocketServer.emit('connection', client);
            });
        });

        websocketServer.on('connection', (client) => {
            this.clients.add(client);
            this.clientCount += 1;
            this.emitStatus();
            client.on('message', (message) => {
                void this.handleMessage(client, message);
            });
            client.on('close', () => {
                this.clients.delete(client);
                this.clearClientSubscriptions(client);
                this.clientCount = Math.max(0, this.clientCount - 1);
                this.emitStatus();
            });
        });
    }

    /** Serves the bundled React build so a LAN browser loads the app; the WebSocket upgrade is same-origin. */
    handleStaticRequest(request, response) {
        if (!this.staticDir || (request.method !== 'GET' && request.method !== 'HEAD')) {
            response.writeHead(NOT_FOUND_STATUS).end();
            return;
        }

        const filePath = resolveStaticFile(this.staticDir, request.url ?? '/');
        if (!filePath) {
            response.writeHead(NOT_FOUND_STATUS).end();
            return;
        }

        fs.readFile(filePath, (error, data) => {
            if (error) {
                response.writeHead(NOT_FOUND_STATUS).end();
                return;
            }

            response.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
            response.end(request.method === 'HEAD' ? undefined : data);
        });
    }

    isAuthorized(request) {
        return protocolTokens(request).includes(this.token);
    }

    async handleMessage(client, rawMessage) {
        let request;
        try {
            request = JSON.parse(rawMessage.toString());
        } catch {
            sendJson(client, { error: { message: 'Invalid remote-control JSON message' }, id: null });
            return;
        }

        const { id, method, params = [] } = request;
        try {
            const result = await this.invoke(client, method, params, id);
            sendJson(client, { id, result });
        } catch (error) {
            sendJson(client, { error: { message: errorMessage(error) }, id });
        }
    }

    async invoke(client, method, params, id) {
        if (method === 'unsubscribe') return this.unsubscribe(client, params);
        if (method === 'onActionExecution') return this.onActionExecution(client, id);
        if (method === 'onWorktreesChanged') return this.onWorktreesChanged(client, id);
        if (method === 'watchProject') return this.watchProject(client, params, id);
        if (!this.dispatcher) throw new Error('Remote-control dispatch is not configured');
        if (AGENT_EVENT_METHODS.has(method)) {
            return this.dispatcher.invoke(method, [...params, (event) => sendJson(client, { event: 'agentRun', payload: { event, requestId: id } })]);
        }

        return this.dispatcher.invoke(method, params);
    }

    watchProject(client, params, id) {
        if (!this.dispatcher) throw new Error('Remote-control dispatch is not configured');
        if (!Array.isArray(params)) throw new Error('Remote-control params must be an array');

        const subscriptionId = crypto.randomUUID();
        const cleanup = this.dispatcher.invoke('watchProject', [
            params[0],
            (event) => sendJson(client, { event: 'watchProject', payload: { event, requestId: id, subscriptionId } }),
        ]);
        this.addSubscription(client, subscriptionId, cleanup);

        return { subscriptionId };
    }

    onActionExecution(client, id) {
        if (!this.dispatcher) throw new Error('Remote-control dispatch is not configured');

        const subscriptionId = crypto.randomUUID();
        const cleanup = this.dispatcher.invoke('onActionExecution', [
            (event) => sendJson(client, { event: 'actionExecution', payload: { event, requestId: id, subscriptionId } }),
        ]);
        this.addSubscription(client, subscriptionId, cleanup);

        return { subscriptionId };
    }

    onWorktreesChanged(client, id) {
        if (!this.dispatcher) throw new Error('Remote-control dispatch is not configured');

        const subscriptionId = crypto.randomUUID();
        const cleanup = this.dispatcher.invoke('onWorktreesChanged', [
            (state) => sendJson(client, { event: 'worktreesChanged', payload: { requestId: id, state, subscriptionId } }),
        ]);
        this.addSubscription(client, subscriptionId, cleanup);

        return { subscriptionId };
    }

    unsubscribe(client, params) {
        if (!Array.isArray(params) || typeof params[0] !== 'string') throw new Error('Missing subscription id');

        return this.removeSubscription(client, params[0]);
    }

    addSubscription(client, subscriptionId, cleanup) {
        const subscriptions = this.subscriptions.get(client) ?? new Map();
        subscriptions.set(subscriptionId, cleanup);
        this.subscriptions.set(client, subscriptions);
    }

    removeSubscription(client, subscriptionId) {
        const subscriptions = this.subscriptions.get(client);
        const cleanup = subscriptions?.get(subscriptionId);
        if (!cleanup) return false;

        cleanup();
        subscriptions.delete(subscriptionId);
        if (subscriptions.size === 0) this.subscriptions.delete(client);

        return true;
    }

    clearClientSubscriptions(client) {
        const subscriptions = this.subscriptions.get(client);
        if (!subscriptions) return;

        for (const cleanup of subscriptions.values()) cleanup();
        this.subscriptions.delete(client);
    }

    clearAllSubscriptions() {
        for (const client of this.subscriptions.keys()) this.clearClientSubscriptions(client);
    }

    emitStatus() {
        if (this.statusListener) this.statusListener(this.getStatus());
    }
}

module.exports = { RemoteControlService };
