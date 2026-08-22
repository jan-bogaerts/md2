import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { countFileContentLines, countPatchLines } = require('./agent_file_change');

describe('agent file changes', () => {
    it('counts complete file content without a phantom terminal line', () => {
        expect(countFileContentLines('')).toBe(0);
        expect(countFileContentLines('first\r\nsecond\r\n')).toBe(2);
        expect(countFileContentLines('first\nsecond')).toBe(2);
        expect(countFileContentLines(null)).toBeNull();
    });

    it('counts validated patch lines while ignoring context and markers', () => {
        expect(countPatchLines([
            ' context',
            '-removed',
            '+added',
            '+++added with pluses',
            '\\ No newline at end of file',
        ])).toEqual({ deletions: 1, insertions: 2 });
        expect(countPatchLines([])).toEqual({ deletions: 0, insertions: 0 });
    });

    it('rejects malformed patch collections and lines', () => {
        expect(countPatchLines(null)).toBeNull();
        expect(countPatchLines(['missing prefix'])).toBeNull();
        expect(countPatchLines(['+valid', 4])).toBeNull();
    });
});
