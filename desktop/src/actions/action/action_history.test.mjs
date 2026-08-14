import { describe, expect, it } from 'vitest';
import { extractAgentCommitIds, extractCommitSummaries } from '../../../../shared/action_history.mjs';

describe('extractAgentCommitIds', () => {
    it('parses marked commit IDs from surrounding prose in first-seen order', () => {
        const output = 'Created change. Commit: a1b2c3d\nLater Commit:\tABCDEF1234567890. Repeated Commit: a1b2c3d';

        expect(extractAgentCommitIds(output)).toEqual(['a1b2c3d', 'ABCDEF1234567890', 'a1b2c3d']);
    });

    it.each([
        ['wrong marker case', 'commit: a1b2c3d'],
        ['missing whitespace', 'Commit:a1b2c3d'],
        ['too short', 'Commit: a1b2c3'],
        ['too long', `Commit: ${'a'.repeat(41)}`],
        ['non-hexadecimal', 'Commit: abcdef1z'],
    ])('ignores %s', (_label, output) => {
        expect(extractAgentCommitIds(output)).toEqual([]);
    });
});

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
