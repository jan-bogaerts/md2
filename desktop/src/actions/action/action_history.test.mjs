import { describe, expect, it } from 'vitest';
import { extractCommitSummaries } from '../../../../shared/action_history.mjs';

describe('extractCommitSummaries', () => {
    it('parses every normal and root commit summary line', () => {
        const output = '[feature/x a1b2c3d] Add tests\nnoise\n[main (root-commit) 0f1e2d3c4b5a] Initial commit';

        expect(extractCommitSummaries(output)).toEqual([
            { branch: 'feature/x', commit: 'a1b2c3d' },
            { branch: 'main', commit: '0f1e2d3c4b5a' },
        ]);
    });

    it('returns an empty list without a commit summary', () => {
        expect(extractCommitSummaries('build ok')).toEqual([]);
    });
});
