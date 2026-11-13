import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { buildWindows } = require('./build_windows');

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

describe('Windows release build', () => {
    it('builds React before packaging Electron', async () => {
        const runNpm = vi.fn(async () => undefined);

        await buildWindows(runNpm);

        expect(runNpm.mock.calls).toEqual([
            [['run', 'build', '--prefix', 'app']],
            [['run', 'package:windows', '--prefix', 'desktop']],
        ]);
    });

    it('does not package when the React build fails', async () => {
        const error = new Error('React build failed');
        const runNpm = vi.fn(async () => { throw error; });

        await expect(buildWindows(runNpm)).rejects.toBe(error);
        expect(runNpm).toHaveBeenCalledTimes(1);
    });

    it('is reachable through the repository build:windows script', () => {
        const rootManifest = require(path.join(repositoryRoot, 'package.json'));
        const [command, scriptPath] = rootManifest.scripts['build:windows'].split(' ');

        expect(command).toBe('node');
        expect(existsSync(path.join(repositoryRoot, scriptPath))).toBe(true);
    });
});
