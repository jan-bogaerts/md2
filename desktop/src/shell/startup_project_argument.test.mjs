import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readStartupProjectPath } = require('./startup_project_argument');

describe('readStartupProjectPath', () => {
    it('reads the first argument after the packaged executable', () => {
        expect(readStartupProjectPath(['C:\\md2\\md2.exe', 'C:\\repo'], true)).toBe(path.resolve('C:\\repo'));
    });

    it('skips the executable and app path in development', () => {
        expect(readStartupProjectPath(['electron.exe', '.', 'C:\\repo'], false)).toBe(path.resolve('C:\\repo'));
        expect(readStartupProjectPath(['electron.exe', '.'], false)).toBeNull();
    });

    it('ignores Chromium switches', () => {
        const argv = ['md2.exe', '--allow-file-access-from-files', '--inspect=9229', 'C:\\repo', 'C:\\other'];

        expect(readStartupProjectPath(argv, true)).toBe(path.resolve('C:\\repo'));
    });

    it('returns null without a folder argument', () => {
        expect(readStartupProjectPath(['md2.exe'], true)).toBeNull();
        expect(readStartupProjectPath(['md2.exe', '--flag'], true)).toBeNull();
    });

    it('resolves relative paths against the working directory', () => {
        expect(readStartupProjectPath(['md2.exe', 'repo'], true)).toBe(path.resolve(process.cwd(), 'repo'));
    });
});
