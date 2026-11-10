import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const executeFile = promisify(execFile);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const electronTestPath = path.resolve(testDirectory, '..', 'test', 'renderer_navigation_electron.js');
const ELECTRON_TEST_TIMEOUT_MS = 10000;

function createElectronEnvironment() {
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;

    return environment;
}

describe('renderer navigation in Electron', () => {
    it('keeps trusted renderer document and unsaved state after a local-file anchor click', async () => {
        const { stdout } = await executeFile(electronPath, [electronTestPath], {
            env: createElectronEnvironment(),
            timeout: ELECTRON_TEST_TIMEOUT_MS,
            windowsHide: true,
        });

        expect(stdout).toContain('navigation-regression-passed');
    });
});
