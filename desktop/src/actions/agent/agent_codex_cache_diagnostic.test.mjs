import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    cacheDiagnosticMessage,
    codexVersionsMatch,
    diagnoseCodexCacheError,
    isCodexCacheError,
    parseCodexVersion,
} = require('./agent_codex_cache_diagnostic');

function versionProcess(version) {
    const child = new EventEmitter();
    child.kill = vi.fn();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
        child.stdout.emit('data', `codex-cli ${version}\n`);
        child.emit('close', 0);
    });

    return child;
}

describe('Codex cache diagnostics', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('recognizes load and renewal errors', () => {
        expect(isCodexCacheError('failed to load models cache: missing field')).toBe(true);
        expect(isCodexCacheError('failed to renew cache TTL: missing field')).toBe(true);
        expect(isCodexCacheError('unrelated provider failure')).toBe(false);
    });

    it('treats prereleases with the same core version as compatible', () => {
        expect(codexVersionsMatch('0.146.0-alpha.9.2', '0.146.0')).toBe(true);
        expect(codexVersionsMatch('0.144.6', '0.146.0')).toBe(false);
        expect(parseCodexVersion('codex-cli 0.146.0-alpha.9.2')).toBe('0.146.0-alpha.9.2');
    });

    it('reports mismatched versions with an update command', () => {
        const message = cacheDiagnosticMessage('cache failed', '0.144.6', '0.146.0');

        expect(message).toContain('Running Codex version: 0.144.6. Cache client version: 0.146.0.');
        expect(message).toContain('npm install --global @openai/codex@latest');
        expect(message).toContain('significantly slow down agent tool calls');
    });

    it('keeps the provider error when versions match', () => {
        const message = cacheDiagnosticMessage('failed to load models cache: broken', '0.146.0-alpha.9.2', '0.146.0');

        expect(message).toContain('failed to load models cache: broken');
        expect(message).toContain('matches cache client version 0.146.0');
        expect(message).toContain('significantly slow down agent tool calls');
    });

    it('reads the cache belonging to CODEX_HOME', async () => {
        const readFile = vi.fn(async () => JSON.stringify({ client_version: '0.146.0' }));
        const spawn = vi.fn(() => versionProcess('0.144.6'));

        const message = await diagnoseCodexCacheError(
            'failed to load models cache: broken',
            'codex.cmd',
            { CODEX_HOME: 'C:\\codex-md2' },
            { homeDirectory: 'C:\\Users\\person', readFile, spawn },
        );

        expect(readFile).toHaveBeenCalledWith('C:\\codex-md2\\models_cache.json', 'utf8');
        expect(spawn).toHaveBeenCalledWith('codex.cmd', ['--version'], expect.objectContaining({ windowsHide: true }));
        expect(message).toContain('Running Codex version: 0.144.6. Cache client version: 0.146.0.');
    });

    it('terminates a timed-out version probe through its owned child handle', async () => {
        vi.useFakeTimers();
        const child = new EventEmitter();
        child.kill = vi.fn();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        const spawn = vi.fn(() => child);
        const messagePromise = diagnoseCodexCacheError(
            'failed to load models cache: broken',
            'codex.cmd',
            {},
            { homeDirectory: 'C:\\Users\\person', readFile: vi.fn(async () => { throw new Error('missing'); }), spawn },
        );

        await vi.advanceTimersByTimeAsync(5_000);
        const message = await messagePromise;

        expect(child.kill).toHaveBeenCalledOnce();
        expect(message).toContain('could not determine both');
    });
});
