import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const { RemoteControlService } = require('./remote_control_service');

let service = null;

function connect(status, token = status.token) {
    return new WebSocket(status.endpoint, token);
}

function waitForOpen(socket) {
    return new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.once('open', resolve);
    });
}

function waitForClose(socket) {
    return new Promise((resolve) => {
        socket.once('close', resolve);
    });
}

function waitForMessage(socket) {
    return new Promise((resolve) => {
        socket.once('message', (message) => resolve(JSON.parse(message.toString())));
    });
}

function waitForMessages(socket, count) {
    return new Promise((resolve) => {
        const messages = [];
        const handleMessage = (message) => {
            messages.push(JSON.parse(message.toString()));
            if (messages.length !== count) return;

            socket.off('message', handleMessage);
            resolve(messages);
        };

        socket.on('message', handleMessage);
    });
}

async function request(socket, id, method, params = []) {
    socket.send(JSON.stringify({ id, method, params }));

    return waitForMessage(socket);
}

function createDispatcher(overrides = {}) {
    const methods = {
        echo: async (value) => value,
        fail: async () => {
            throw new Error('method failed');
        },
        runSearchRegexpAgent: async (_input, onEvent) => {
            onEvent({ content: 'hello', runId: 'run-1', type: 'output' });

            return 'foo.*bar';
        },
        onWorktreesChanged: (onChange) => {
            onChange({ error: null, project: { branch: 'main', id: 'local' }, records: [] });

            return vi.fn();
        },
        watchProject: (_project, onChange) => {
            onChange({ changeKind: 'changed', path: 'design/F-1.md' });

            return vi.fn();
        },
        ...overrides,
    };

    return {
        invoke(method, params) {
            const handler = methods[method];
            if (!handler) throw new Error(`Unknown method ${method}`);

            return handler(...params);
        },
    };
}

describe('RemoteControlService', () => {
    afterEach(async () => {
        if (service) await service.stop();
        service = null;
    });

    it('handles authenticated JSON-RPC requests with large payloads and concurrent ids', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);
        const largePayload = 'x'.repeat(512);

        const responsePromise = waitForMessages(socket, 2);
        socket.send(JSON.stringify({ id: 'large', method: 'echo', params: [largePayload] }));
        socket.send(JSON.stringify({ id: 'small', method: 'echo', params: ['ok'] }));
        const responses = await responsePromise;

        expect(responses).toEqual(expect.arrayContaining([
            { id: 'large', result: largePayload },
            { id: 'small', result: 'ok' },
        ]));
        expect(service.getStatus().clientCount).toBe(1);
    });

    it('rejects connections without the token', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status, 'wrong-token');

        await expect(waitForOpen(socket)).rejects.toThrow();
    });

    it('does not put the token in the endpoint URL', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);

        expect(status.endpoint).not.toContain(status.token);
    });

    it('returns method errors by request id', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);

        await expect(request(socket, 'fail-1', 'fail')).resolves.toEqual({
            error: { message: 'method failed' },
            id: 'fail-1',
        });
    });

    it('pushes watchProject and agent run events', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);

        const watchPromise = waitForMessages(socket, 2);
        socket.send(JSON.stringify({ id: 'watch-1', method: 'watchProject', params: [{ id: 'local' }] }));
        const [watchPush, watchResponse] = await watchPromise;
        const agentPromise = waitForMessages(socket, 2);
        socket.send(JSON.stringify({ id: 'agent-1', method: 'runSearchRegexpAgent', params: ['find beta'] }));
        const [agentPush, agentResponse] = await agentPromise;

        expect(watchPush.event).toBe('watchProject');
        expect(watchPush.payload.event).toEqual({ changeKind: 'changed', path: 'design/F-1.md' });
        expect(watchResponse.result.subscriptionId).toEqual(expect.any(String));
        expect(agentPush).toEqual({
            event: 'agentRun',
            payload: {
                event: { content: 'hello', runId: 'run-1', type: 'output' },
                requestId: 'agent-1',
            },
        });
        expect(agentResponse).toEqual({ id: 'agent-1', result: 'foo.*bar' });
    });

    it('pushes the initial worktree snapshot to a remote subscriber', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);

        const messagesPromise = waitForMessages(socket, 2);
        socket.send(JSON.stringify({ id: 'worktrees-1', method: 'onWorktreesChanged', params: [] }));
        const [push, response] = await messagesPromise;

        expect(push).toEqual(expect.objectContaining({
            event: 'worktreesChanged',
            payload: expect.objectContaining({
                requestId: 'worktrees-1',
                state: { error: null, project: { branch: 'main', id: 'local' }, records: [] },
            }),
        }));
        expect(response.result.subscriptionId).toEqual(expect.any(String));
    });

    it('closes clients on stop', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start();
        const socket = connect(status);
        await waitForOpen(socket);

        await service.stop();

        await expect(waitForClose(socket)).resolves.toBeDefined();
        expect(service.getStatus()).toEqual({
            active: false,
            clientCount: 0,
            endpoint: null,
            hostnameEndpoint: null,
            ipEndpoints: [],
            token: null,
        });
    });

    it('reports hostname and IP endpoints when bound to the LAN', async () => {
        service = new RemoteControlService(createDispatcher());
        const status = await service.start({ host: '0.0.0.0' });
        const port = service.server.address().port;

        expect(status.hostnameEndpoint).toBe(`ws://${os.hostname().toLowerCase()}.local:${port}`);
        expect(status.endpoint).toBe(status.hostnameEndpoint);
        expect(Array.isArray(status.ipEndpoints)).toBe(true);
        for (const endpoint of status.ipEndpoints) expect(endpoint).toMatch(/^ws:\/\/\d+\.\d+\.\d+\.\d+:\d+$/);
    });

    it('requires a token for non-loopback binds', async () => {
        service = new RemoteControlService(createDispatcher());

        await expect(service.start({ host: '0.0.0.0', token: '' })).resolves.toMatchObject({ token: expect.any(String) });
        expect(service.getStatus().token).toEqual(expect.any(String));
    });

    it('serves the bundled web app over http and coexists with the WebSocket upgrade', async () => {
        const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2-static-'));
        fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>md2</title>');
        fs.writeFileSync(path.join(staticDir, 'app.js'), 'console.log(1)');
        service = new RemoteControlService(createDispatcher());
        const status = await service.start({ staticDir });
        const base = `http://127.0.0.1:${service.server.address().port}`;

        const index = await fetch(`${base}/`);
        expect(index.status).toBe(200);
        expect(index.headers.get('content-type')).toContain('text/html');
        expect(await index.text()).toContain('md2');

        const asset = await fetch(`${base}/app.js`);
        expect(asset.status).toBe(200);
        expect(asset.headers.get('content-type')).toContain('text/javascript');

        const socket = connect(status);
        await waitForOpen(socket);
        expect(service.getStatus().clientCount).toBe(1);

        fs.rmSync(staticDir, { recursive: true, force: true });
    });

    it('returns 404 for missing files and rejects path traversal', async () => {
        const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2-static-'));
        fs.writeFileSync(path.join(staticDir, 'index.html'), 'index');
        service = new RemoteControlService(createDispatcher());
        await service.start({ staticDir });
        const base = `http://127.0.0.1:${service.server.address().port}`;

        expect((await fetch(`${base}/nope.js`)).status).toBe(404);
        expect((await fetch(`${base}/../main.js`)).status).toBe(404);
        expect((await fetch(`${base}/%2e%2e/main.js`)).status).toBe(404);

        fs.rmSync(staticDir, { recursive: true, force: true });
    });
});
