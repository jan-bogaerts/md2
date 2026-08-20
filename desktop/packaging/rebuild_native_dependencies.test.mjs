import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    WINDOWS_NODE_PTY_PREBUILD_FILES,
    assertNodePtyPrebuildExists,
    getNodePtyRebuildMetadataPath,
    rebuildNativeDependencies,
} = require('./rebuild_native_dependencies');

function createWindowsPrebuild(appDirectory) {
    const prebuildDirectory = path.join(appDirectory, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64');
    mkdirSync(prebuildDirectory, { recursive: true });
    WINDOWS_NODE_PTY_PREBUILD_FILES.forEach((fileName) => writeFileSync(path.join(prebuildDirectory, fileName), ''));
}

describe('native dependency rebuild', () => {
    it('fails before packaging when a Windows node-pty prebuild is incomplete', () => {
        const appDirectory = mkdtempSync(path.join(tmpdir(), 'md2-node-pty-'));

        expect(() => assertNodePtyPrebuildExists(appDirectory, 'win32', 'x64'))
            .toThrow('missing win32-x64 prebuild files');
    });

    it('marks the prebuild with the Electron ABI and retains normal dependency processing', async () => {
        const appDirectory = mkdtempSync(path.join(tmpdir(), 'md2-node-pty-'));
        const getAbi = vi.fn(() => '148');
        createWindowsPrebuild(appDirectory);

        const result = await rebuildNativeDependencies({
            appDir: appDirectory,
            arch: 'x64',
            electronVersion: '43.0.0',
            platform: 'win32',
        }, getAbi);

        expect(getAbi).toHaveBeenCalledWith('43.0.0', 'electron');
        expect(readFileSync(getNodePtyRebuildMetadataPath(appDirectory), 'utf8')).toBe('x64--148');
        expect(result).toBe(true);
    });
});
