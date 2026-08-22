import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { countFileContentLines, countLineChanges, countPatchLines } = require('./agent_file_change');

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

    it('finds smallest whole-line insertion and deletion difference', () => {
        expect(countLineChanges('first\nshared\nlast\n', 'changed\nshared\nnew\n'))
            .toEqual({ deletions: 2, insertions: 2 });
        expect(countLineChanges('', 'first\nsecond')).toEqual({ deletions: 0, insertions: 2 });
        expect(countLineChanges('first\nsecond', '')).toEqual({ deletions: 2, insertions: 0 });
        expect(countLineChanges('same', 'same')).toEqual({ deletions: 0, insertions: 0 });
        expect(countLineChanges(null, 'new')).toBeNull();
    });
});
