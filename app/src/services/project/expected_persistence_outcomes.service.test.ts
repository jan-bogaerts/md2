import { describe, expect, it } from 'vitest';
import {
    EXPECTED_PERSISTENCE_OUTCOME_LIMIT,
    ExpectedPersistenceOutcomes,
    type ExpectedPersistenceOutcome,
} from './expected_persistence_outcomes';

describe('ExpectedPersistenceOutcomes', () => {
    it('keeps latest normalized outcome until matching persisted state is observed', () => {
        const outcomes = new ExpectedPersistenceOutcomes();
        const firstOperation = outcomes.registerOperation([{ content: 'first', kind: 'present', path: 'design\\card.md' }]);
        const secondOperation = outcomes.registerOperation([{ content: 'second', kind: 'present', path: 'design/card.md' }]);

        outcomes.settleOperation(firstOperation);
        outcomes.settleOperation(secondOperation);

        expect(outcomes.getExpected('design/card.md')).toEqual({ content: 'second', kind: 'present', path: 'design/card.md' });
        expect(outcomes.classify({ content: 'second', kind: 'present', path: 'design\\card.md' })).toBe('matched');
        expect(outcomes.getExpected('design/card.md')).toBeNull();
    });

    it('waits until every operation affecting one path settles', async () => {
        const outcomes = new ExpectedPersistenceOutcomes();
        const firstOperation = outcomes.registerOperation([{ content: 'first', kind: 'present', path: 'design/card.md' }]);
        const secondOperation = outcomes.registerOperation([{ content: 'second', kind: 'present', path: 'design/card.md' }]);
        let settled = false;
        const waiting = outcomes.waitForSettled('design/card.md').then(() => {
            settled = true;
        });

        outcomes.settleOperation(firstOperation);
        await Promise.resolve();
        expect(settled).toBe(false);

        outcomes.settleOperation(secondOperation);
        await waiting;
        expect(settled).toBe(true);
    });

    it('retains outcomes after failed storage work settles and consumes mismatches', async () => {
        const outcomes = new ExpectedPersistenceOutcomes();
        const operation = outcomes.registerOperation([{ kind: 'absent', path: 'design/card.md' }]);

        outcomes.settleOperation(operation);
        await outcomes.waitForSettled('design/card.md');

        expect(outcomes.getExpected('design/card.md')).toEqual({ kind: 'absent', path: 'design/card.md' });
        expect(outcomes.classify({ content: 'external', kind: 'present', path: 'design/card.md' })).toBe('mismatched');
        expect(outcomes.classify({ content: 'external', kind: 'present', path: 'design/card.md' })).toBe('untracked');
    });

    it('requests verification before retained state exceeds its bound', () => {
        const outcomes = new ExpectedPersistenceOutcomes();
        const retainedOutcomes: ExpectedPersistenceOutcome[] = Array.from(
            { length: EXPECTED_PERSISTENCE_OUTCOME_LIMIT },
            (_, index) => ({ content: String(index), kind: 'present', path: `design/${index}.md` }),
        );
        outcomes.registerOperation(retainedOutcomes);

        expect(outcomes.shouldVerifyBeforeRegister([{ content: 'next', kind: 'present', path: 'design/next.md' }])).toBe(true);
        expect(outcomes.shouldVerifyBeforeRegister([{ content: 'replacement', kind: 'present', path: 'design/0.md' }])).toBe(false);
    });

    it('clears outcomes and releases pending waits on project reset', async () => {
        const outcomes = new ExpectedPersistenceOutcomes();
        outcomes.registerOperation([{ content: 'local', kind: 'present', path: 'design/card.md' }]);
        const waiting = outcomes.waitForSettled('design/card.md');

        outcomes.reset();
        await waiting;

        expect(outcomes.retainedOutcomeCount).toBe(0);
        expect(outcomes.getExpected('design/card.md')).toBeNull();
    });
});
