import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { updateCodexCli } = require('./codex_cli_update');

function processHarness() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    return child;
}

describe('updateCodexCli', () => {
    it('runs only the fixed hidden Codex npm update command', async () => {
        const child = processHarness();
        const spawn = vi.fn(() => child);
        const updating = updateCodexCli(spawn);
        child.stdout.emit('data', 'updated');
        child.emit('close', 0);

        await expect(updating).resolves.toEqual({ stderr: '', stdout: 'updated' });
        expect(spawn).toHaveBeenCalledWith(
            'npm',
            ['install', '--global', '@openai/codex@latest'],
            { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
        );
    });

    it('bounds captured process output', async () => {
        const child = processHarness();
        const updating = updateCodexCli(() => child);
        child.stderr.emit('data', 'x'.repeat(100_000));
        child.emit('close', 0);

        const result = await updating;
        expect(result.stderr.length).toBe(65_536);
    });

    it('rejects spawn and non-zero exit failures with concise errors', async () => {
        const spawnFailure = new Error('npm unavailable');
        await expect(updateCodexCli(() => { throw spawnFailure; })).rejects.toThrow('Codex update failed: npm unavailable');

        const child = processHarness();
        const updating = updateCodexCli(() => child);
        child.stderr.emit('data', 'npm warning\npermission denied\n');
        child.emit('close', 1);

        await expect(updating).rejects.toThrow('Codex update failed: permission denied');
    });
});
