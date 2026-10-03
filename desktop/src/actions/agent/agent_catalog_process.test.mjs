import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentCatalogProcess } = require('./agent_catalog_process');

function processFixture(agent = 'codex', options = {}) {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const messages = [];
    child.stdin.on('data', (chunk) => messages.push(JSON.parse(chunk.toString())));
    const terminateProcessTree = vi.fn(async () => true);
    const probe = new AgentCatalogProcess(agent, { spawn: vi.fn(() => child), terminateProcessTree, ...options });
    probe.start('/client', [], { cwd: '/project', env: { API_KEY: 'private-token' } });

    return { child, probe, messages, terminateProcessTree };
}

afterEach(() => vi.useRealTimers());

describe('bounded catalog protocol', () => {
    it('correlates responses and decodes fragmented Unicode without recording unrelated notifications', async () => {
        const { child, probe, messages, terminateProcessTree } = processFixture();
        const completion = probe.request('model/list', {});
        child.stdout.write('{"method":"unrelated","params":{}}\n');
        const output = Buffer.from(JSON.stringify({ id: messages[0].id, result: { name: 'Modèle' } }) + '\n');
        const split = output.indexOf(Buffer.from('è')) + 1;
        child.stdout.write(output.subarray(0, split));
        child.stdout.write(output.subarray(split));
        expect(await completion).toEqual({ name: 'Modèle' });
        await probe.close();
        expect(terminateProcessTree).toHaveBeenCalledOnce();
        expect(messages.map(({ method }) => method)).toEqual(['model/list']);
    });

    it('extracts Claude control responses without sending a user message', async () => {
        const { child, probe, messages } = processFixture('claude');
        const completion = probe.request('initialize', { hooks: null });
        child.stdout.write(JSON.stringify({type: 'control_response', response: { subtype: 'success', request_id: messages[0].request_id, response: { models: [] } }}) + '\n');
        expect(await completion).toEqual({ models: [] });
        expect(messages[0].type).toBe('control_request');
        await probe.close();
    });

    it('rejects malformed output and provider failures without exposing environment secrets', async () => {
        const { child, probe } = processFixture();
        const completion = probe.request('initialize', {});
        child.stdout.write('{"id":1,"error":{"message":"Rejected private-token"}}\n');
        await expect(completion).rejects.toThrow('Rejected [secret]');
        await probe.close();
        const malformed = processFixture();
        const malformedCompletion = malformed.probe.request('initialize', {});
        malformed.child.stdout.write('invalid-json\n');
        await expect(malformedCompletion).rejects.toThrow();
        await malformed.probe.close();
    });

    it('bounds output and rejects hanging or cancelled requests', async () => {
        vi.useFakeTimers();
        const { probe } = processFixture('codex', { timeoutMs: 10 });
        const completion = expect(probe.request('initialize', {})).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(10);
        await completion;
        await probe.close();
        const oversized = processFixture('codex', { maximumOutputBytes: 4 });
        const oversizedCompletion = expect(oversized.probe.request('initialize', {})).rejects.toThrow('output limit');
        oversized.child.stderr.write('too much output');
        await oversizedCompletion;
        await oversized.probe.close();
        const cancelled = processFixture();
        const cancelledCompletion = expect(cancelled.probe.request('initialize', {})).rejects.toThrow('cancelled');
        await cancelled.probe.close();
        await cancelledCompletion;
    });
});
