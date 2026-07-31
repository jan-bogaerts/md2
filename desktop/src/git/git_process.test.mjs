import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    GitProcess,
    LOCAL_GIT_TIMEOUT_MS,
    NETWORK_GIT_TIMEOUT_MS,
    gitTimeoutPolicy,
} = require('./git_process');

describe('git process', () => {
    it('uses separate local and network timeout policies', () => {
        expect(gitTimeoutPolicy(['status', '--porcelain'])).toEqual({
            operation: 'desktop Git status',
            timeoutMs: LOCAL_GIT_TIMEOUT_MS,
        });
        expect(gitTimeoutPolicy(['fetch'])).toEqual({
            operation: 'desktop Git fetch',
            timeoutMs: NETWORK_GIT_TIMEOUT_MS,
        });
        expect(gitTimeoutPolicy(['pull', '--ff-only']).timeoutMs).toBe(NETWORK_GIT_TIMEOUT_MS);
        expect(gitTimeoutPolicy(['push']).timeoutMs).toBe(NETWORK_GIT_TIMEOUT_MS);
    });

    it('terminates a timed-out process tree and reports actionable context', async () => {
        const child = { exitCode: null, kill: vi.fn(), pid: 42, signalCode: null };
        const execFile = vi.fn(() => child);
        const terminateProcessTree = vi.fn(async () => undefined);
        const process = new GitProcess({
            args: ['status', '--porcelain'],
            operation: 'desktop Git status refresh',
            rootPath: 'C:\\repo',
            timeoutMs: LOCAL_GIT_TIMEOUT_MS,
        }, {
            clearTimeout: vi.fn(),
            execFile,
            now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(31_000),
            setTimeout: vi.fn(() => 1),
            terminateProcessTree,
        });

        const result = process.run();
        await process.handleTimeout();

        await expect(result).rejects.toMatchObject({
            code: 'GIT_TIMEOUT',
            command: ['git', 'status', '--porcelain'],
            cwd: 'C:\\repo',
            elapsedMs: 30_000,
            operation: 'desktop Git status refresh',
        });
        await expect(result).rejects.toThrow('command="git" "status" "--porcelain" cwd="C:\\\\repo" elapsedMs=30000');
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });

    it('preserves normal command output and does not terminate its process', async () => {
        let complete;
        const child = { pid: 42 };
        const execFile = vi.fn((executable, args, options, callback) => {
            complete = callback;

            return child;
        });
        const terminateProcessTree = vi.fn(async () => undefined);
        const process = new GitProcess({
            args: ['rev-parse', 'HEAD'],
            operation: 'desktop Git rev-parse',
            rootPath: 'C:\\repo',
            timeoutMs: LOCAL_GIT_TIMEOUT_MS,
        }, { execFile, terminateProcessTree });

        const result = process.run();
        complete(null, 'abc\n', '');

        await expect(result).resolves.toEqual({ stderr: '', stdout: 'abc\n' });
        expect(terminateProcessTree).not.toHaveBeenCalled();
    });
});
