import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { terminateProcessTree } = require('./process_tree');

describe('process-tree', () => {
    it('terminates only the known Windows process tree', async () => {
        const child = { exitCode: null, kill: vi.fn(), pid: 10, signalCode: null };
        const terminateWindowsTree = vi.fn(async () => undefined);

        const terminated = await terminateProcessTree(child, { platform: 'win32', terminateWindowsTree });

        expect(terminated).toBe(true);
        expect(terminateWindowsTree).toHaveBeenCalledWith(10);
        expect(child.kill).not.toHaveBeenCalled();
    });

    it('terminates the known POSIX process group', async () => {
        const child = { exitCode: null, kill: vi.fn(), pid: 10, signalCode: null };
        const terminateProcessGroup = vi.fn();

        const terminated = await terminateProcessTree(child, { platform: 'linux', terminateProcessGroup });

        expect(terminated).toBe(true);
        expect(terminateProcessGroup).toHaveBeenCalledWith(10);
        expect(child.kill).not.toHaveBeenCalled();
    });

    it('does not inspect or terminate an already closed process', async () => {
        const child = { exitCode: 0, kill: vi.fn(), pid: 10, signalCode: null };
        const terminateWindowsTree = vi.fn(async () => undefined);

        const terminated = await terminateProcessTree(child, { platform: 'win32', terminateWindowsTree });

        expect(terminated).toBe(false);
        expect(terminateWindowsTree).not.toHaveBeenCalled();
        expect(child.kill).not.toHaveBeenCalled();
    });
});
