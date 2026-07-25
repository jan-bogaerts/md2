import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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
