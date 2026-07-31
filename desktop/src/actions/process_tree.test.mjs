import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { OwnedProcessTracker } = require('./owned_process_tracker');
const { descendantProcesses } = require('./process_tree');

describe('process-tree', () => {
    it('finds every descendant without including unrelated processes', () => {
        const processes = [
            { name: 'sh.exe', parentPid: 10, pid: 20 },
            { name: 'git.exe', parentPid: 20, pid: 30 },
            { name: 'node.exe', parentPid: 99, pid: 40 },
        ];

        expect(descendantProcesses(processes, 10)).toEqual([
            { name: 'sh.exe', parentPid: 10, pid: 20 },
            { name: 'git.exe', parentPid: 20, pid: 30 },
        ]);
    });
});

describe('OwnedProcessTracker', () => {
    it('reports and terminates its original root identity during cancellation', async () => {
        const snapshot = [{ creationTime: 'root-start', name: 'agent.exe', parentPid: 1, pid: 10 }];
        const terminateProcess = vi.fn(async () => undefined);
        const tracker = new OwnedProcessTracker({
            clearInterval: vi.fn(),
            listProcesses: vi.fn(async () => snapshot),
            owner: 'run-1',
            rootPid: 10,
            setInterval: vi.fn(() => 1),
            terminateProcess,
        });

        await tracker.start();
        const rootTerminated = await tracker.terminate(true);

        expect(rootTerminated).toBe(true);
        expect(terminateProcess).toHaveBeenCalledWith(10);
    });

    it('retains descendants after their intermediate parent exits', async () => {
        const snapshots = [
            [
                { creationTime: 'root-start', name: 'agent.exe', parentPid: 1, pid: 10 },
                { creationTime: 'shell-start', name: 'sh.exe', parentPid: 10, pid: 20 },
                { creationTime: 'git-start', name: 'git.exe', parentPid: 20, pid: 30 },
            ],
            [
                { creationTime: 'root-start', name: 'agent.exe', parentPid: 1, pid: 10 },
                { creationTime: 'git-start', name: 'git.exe', parentPid: 20, pid: 30 },
            ],
        ];
        const terminateProcess = vi.fn(async () => undefined);
        const tracker = new OwnedProcessTracker({
            clearInterval: vi.fn(),
            listProcesses: vi.fn(async () => snapshots.shift()),
            owner: 'run-1',
            rootPid: 10,
            setInterval: vi.fn(() => 1),
            terminateProcess,
        });

        await tracker.start();
        await tracker.terminate(false);

        expect(terminateProcess).toHaveBeenCalledOnce();
        expect(terminateProcess).toHaveBeenCalledWith(30);
    });

    it('does not terminate a reused PID or unrelated process', async () => {
        const snapshots = [
            [
                { creationTime: 'root-start', name: 'agent.exe', parentPid: 1, pid: 10 },
                { creationTime: 'git-start', name: 'git.exe', parentPid: 10, pid: 30 },
                { creationTime: 'other-start', name: 'git.exe', parentPid: 99, pid: 40 },
            ],
            [
                { creationTime: 'root-start', name: 'agent.exe', parentPid: 1, pid: 10 },
                { creationTime: 'reused-start', name: 'unrelated.exe', parentPid: 99, pid: 30 },
                { creationTime: 'other-start', name: 'git.exe', parentPid: 99, pid: 40 },
            ],
        ];
        const terminateProcess = vi.fn(async () => undefined);
        const tracker = new OwnedProcessTracker({
            clearInterval: vi.fn(),
            listProcesses: vi.fn(async () => snapshots.shift()),
            owner: 'run-1',
            rootPid: 10,
            setInterval: vi.fn(() => 1),
            terminateProcess,
        });

        await tracker.start();
        await tracker.terminate(false);

        expect(terminateProcess).not.toHaveBeenCalled();
    });

    it('does not claim a reused root PID after initial root exit', async () => {
        const snapshots = [
            [],
            [{ creationTime: 'reused-start', name: 'unrelated.exe', parentPid: 99, pid: 10 }],
        ];
        const terminateProcess = vi.fn(async () => undefined);
        const tracker = new OwnedProcessTracker({
            clearInterval: vi.fn(),
            listProcesses: vi.fn(async () => snapshots.shift()),
            owner: 'run-1',
            rootPid: 10,
            setInterval: vi.fn(() => 1),
            terminateProcess,
        });

        await tracker.start();
        await tracker.terminate(true);

        expect(terminateProcess).not.toHaveBeenCalled();
    });
});
