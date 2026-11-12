import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { buildWindows } = require('./build_windows');

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const SENTRY_UPLOAD_ENVIRONMENT = {
    SENTRY_AUTH_TOKEN: 'build-secret',
    SENTRY_ORG: 'md2-org',
    SENTRY_PROJECT: 'md2-project',
};

describe('Windows release build', () => {
    it('builds React, verifies renderer source maps, then packages Electron', async () => {
        const steps = [];
        const runNpm = vi.fn(async (args) => { steps.push(args.join(' ')); });
        const verifySourceMaps = vi.fn(async () => { steps.push('verify source maps'); });

        await buildWindows(runNpm, SENTRY_UPLOAD_ENVIRONMENT, verifySourceMaps);

        expect(steps).toEqual([
            'run build --prefix app',
            'verify source maps',
            'run package:windows --prefix desktop',
        ]);
    });

    it('does not package when the React build fails', async () => {
        const error = new Error('React build failed');
        const runNpm = vi.fn(async () => { throw error; });
        const verifySourceMaps = vi.fn(async () => undefined);

        await expect(buildWindows(runNpm, SENTRY_UPLOAD_ENVIRONMENT, verifySourceMaps)).rejects.toBe(error);
        expect(runNpm).toHaveBeenCalledTimes(1);
        expect(verifySourceMaps).not.toHaveBeenCalled();
    });

    it('does not package when renderer source-map verification fails', async () => {
        const error = new Error('Renderer bundles without Sentry debug IDs: index.js');
        const runNpm = vi.fn(async () => undefined);
        const verifySourceMaps = vi.fn(async () => { throw error; });

        await expect(buildWindows(runNpm, SENTRY_UPLOAD_ENVIRONMENT, verifySourceMaps)).rejects.toBe(error);
        expect(runNpm).toHaveBeenCalledTimes(1);
    });

    it('refuses to start without the Sentry source-map upload configuration', async () => {
        const runNpm = vi.fn(async () => undefined);
        const environment = { SENTRY_AUTH_TOKEN: 'build-secret' };

        await expect(buildWindows(runNpm, environment, vi.fn())).rejects
            .toThrow('Release build requires Sentry source-map upload configuration; missing: SENTRY_ORG, SENTRY_PROJECT');
        expect(runNpm).not.toHaveBeenCalled();
    });

    it('is reachable through the repository build:windows script', () => {
        const rootManifest = require(path.join(repositoryRoot, 'package.json'));
        const [command, scriptPath] = rootManifest.scripts['build:windows'].split(' ');

        expect(command).toBe('node');
        expect(existsSync(path.join(repositoryRoot, scriptPath))).toBe(true);
    });
});
