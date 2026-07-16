import { describe, expect, it } from 'vitest';
import { extractCommitSummary } from '../../../shared/action_history.mjs';

describe('extractCommitSummary', () => {
    it('parses normal and root commit summary lines', () => {
        expect(extractCommitSummary('[feature/x a1b2c3d] Add tests')).toEqual({ branch: 'feature/x', commit: 'a1b2c3d' });
        expect(extractCommitSummary('[main (root-commit) 0f1e2d3c4b5a] Initial commit'))
            .toEqual({ branch: 'main', commit: '0f1e2d3c4b5a' });
    });

    it('returns null without a commit summary', () => {
        expect(extractCommitSummary('build ok')).toBeNull();
    });
});
