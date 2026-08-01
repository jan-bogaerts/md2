import { describe, expect, it } from 'vitest';
import { parseActivityValue } from '../../../../shared/card_activity.mjs';

const origin = { cardInternalId: 'card-1', kind: 'card' };

function record() {
    return {
        commits: [],
        completedAt: '2026-08-01T12:01:00.000Z',
        conversationIds: [],
        history: {
            completedAt: '2026-08-01T12:01:00.000Z',
            output: 'done',
            prompt: '',
            status: 'completed',
        },
        origin,
        rootActionId: 'build',
        rootActionLabel: 'Build',
        runId: 'run-1',
        startedAt: '2026-08-01T12:00:00.000Z',
        status: 'completed',
    };
}

describe('card activity action runs', () => {
    it('parses the runId activity contract', () => {
        const activity = parseActivityValue({ conversations: [], origin, records: [record()], version: 1 }, origin);

        expect(activity.records[0].runId).toBe('run-1');
    });

    it('rejects the removed executionId field', () => {
        const legacyRecord = { ...record(), executionId: 'execution-1' };
        delete legacyRecord.runId;

        expect(() => parseActivityValue({ conversations: [], origin, records: [legacyRecord], version: 1 }, origin))
            .toThrow('Malformed activity file: missing records[0].runId');
    });
});
