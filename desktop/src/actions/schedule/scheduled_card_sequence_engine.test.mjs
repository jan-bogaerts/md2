import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ScheduledCardSequenceEngine } = require('./scheduled_card_sequence_engine');

function createDeferred() {
    let resolve = () => undefined;
    let reject = () => undefined;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, reject, resolve };
}

function createSequence(overrides = {}) {
    return {
        actionCompleted: false,
        actionId: 'implement',
        cardInternalIds: ['card-1', 'card-2'],
        createdAt: '2026-09-18T10:00:00.000Z',
        currentIndex: 0,
        currentRunId: null,
        failure: null,
        id: 'sequence-1',
        kind: 'sequence',
        readyState: 'ready',
        readyStateMet: false,
        status: 'pending',
        trigger: { type: 'now' },
        ...overrides,
    };
}

function createHarness(initialSchedule, statesByCard = { 'card-1': 'todo', 'card-2': 'todo' }) {
    let schedule = initialSchedule;
    let nextRunNumber = 1;
    const runs = new Map();
    const actionRunnerService = {
        allocateRunId: vi.fn(() => `run-${nextRunNumber++}`),
        cancel: vi.fn((runId) => runs.get(runId).resolve({ failure: null, status: 'cancelled' })),
        start: vi.fn(async (_request, { runId }) => {
            if (!runs.has(runId)) runs.set(runId, createDeferred());

            return runId;
        }),
        wait: vi.fn((runId) => {
            if (!runs.has(runId)) runs.set(runId, createDeferred());

            return runs.get(runId).promise;
        }),
    };
    const engine = new ScheduledCardSequenceEngine({
        actionRunnerService,
        allocateRunId: () => actionRunnerService.allocateRunId(),
        isCurrent: () => true,
        loadSchedules: async () => [schedule],
        resolveCardContext: async (cardInternalId) => ({
            cardInternalId,
            file: `cards/${cardInternalId}.md`,
            kind: 'card',
            state: statesByCard[cardInternalId],
            title: cardInternalId,
            type: 'feature',
        }),
        saveSequence: async (nextSchedule) => {
            schedule = nextSchedule;

            return schedule;
        },
        states: ['todo', 'ready'],
    });

    return { actionRunnerService, engine, runs, schedule: () => schedule };
}

describe('ScheduledCardSequenceEngine', () => {
    it('runs cards in order after state-before-completion satisfies both conditions', async () => {
        const harness = createHarness(createSequence());

        await harness.engine.activate('sequence-1');
        await harness.engine.handleCardStateChange('card-1', 'ready');
        harness.runs.get('run-1').resolve({ failure: null, status: 'completed' });
        await vi.waitFor(() => expect(harness.actionRunnerService.start).toHaveBeenCalledTimes(2));

        expect(harness.actionRunnerService.start.mock.calls.map(([request]) => request.context.cardInternalId))
            .toEqual(['card-1', 'card-2']);
        expect(harness.schedule()).toMatchObject({ currentIndex: 1, status: 'running' });
    });

    it('waits for state after completion and ignores duplicate state events', async () => {
        const harness = createHarness(createSequence());

        await harness.engine.activate('sequence-1');
        harness.runs.get('run-1').resolve({ failure: null, status: 'completed' });
        await vi.waitFor(() => expect(harness.schedule().actionCompleted).toBe(true));
        expect(harness.actionRunnerService.start).toHaveBeenCalledOnce();

        await harness.engine.handleCardStateChange('card-1', 'ready');
        await harness.engine.handleCardStateChange('card-1', 'ready');

        expect(harness.actionRunnerService.start).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['failed', 'agent failed', 'failed'],
        ['cancelled', null, 'cancelled'],
    ])('stops sequence when action is %s', async (resultStatus, failure, scheduleStatus) => {
        const harness = createHarness(createSequence());

        await harness.engine.activate('sequence-1');
        harness.runs.get('run-1').resolve({ failure, status: resultStatus });
        await vi.waitFor(() => expect(harness.schedule().status).toBe(scheduleStatus));

        expect(harness.actionRunnerService.start).toHaveBeenCalledOnce();
        expect(harness.schedule().failure).toBe(failure ?? 'Sequence action was cancelled');
    });

    it('recovers persisted active run without starting current card again', async () => {
        const schedule = createSequence({ currentRunId: 'existing-run', readyStateMet: true, status: 'running' });
        const harness = createHarness(schedule);

        await harness.engine.activate('sequence-1');
        expect(harness.actionRunnerService.start).not.toHaveBeenCalled();
        harness.runs.get('existing-run').resolve({ failure: null, status: 'completed' });
        await vi.waitFor(() => expect(harness.actionRunnerService.start).toHaveBeenCalledOnce());

        expect(harness.actionRunnerService.start.mock.calls[0][0].context.cardInternalId).toBe('card-2');
    });

    it('resumes completed current card without rerunning it', async () => {
        const schedule = createSequence({ actionCompleted: true, status: 'running' });
        const harness = createHarness(schedule, { 'card-1': 'ready', 'card-2': 'todo' });

        await harness.engine.activate('sequence-1');

        expect(harness.actionRunnerService.start).toHaveBeenCalledOnce();
        expect(harness.actionRunnerService.start.mock.calls[0][0].context.cardInternalId).toBe('card-2');
    });

    it('fails instead of duplicating active action when recovery cannot prove outcome', async () => {
        const schedule = createSequence({ currentRunId: 'lost-run', status: 'running' });
        const harness = createHarness(schedule);
        harness.actionRunnerService.wait.mockRejectedValueOnce(new Error('Unknown action run: lost-run'));

        await harness.engine.activate('sequence-1');
        await vi.waitFor(() => expect(harness.schedule().status).toBe('failed'));

        expect(harness.actionRunnerService.start).not.toHaveBeenCalled();
        expect(harness.schedule().failure).toContain('Cannot recover sequence action run lost-run');
    });

    it('fails clearly when ready state was removed', async () => {
        const harness = createHarness(createSequence({ readyState: 'removed' }));

        await harness.engine.activate('sequence-1');

        expect(harness.schedule()).toMatchObject({
            failure: 'Sequence ready state is not configured: removed',
            status: 'failed',
        });
        expect(harness.actionRunnerService.start).not.toHaveBeenCalled();
    });

    it('fails clearly when current card is missing', async () => {
        const harness = createHarness(createSequence());
        harness.engine.resolveCardContext = async () => {
            throw new Error('Sequence card not found: card-1');
        };

        await harness.engine.activate('sequence-1');

        expect(harness.schedule()).toMatchObject({ failure: 'Sequence card not found: card-1', status: 'failed' });
    });

    it('fails clearly when selected action is missing', async () => {
        const harness = createHarness(createSequence());
        harness.actionRunnerService.start.mockRejectedValueOnce(new Error('Unknown action: implement'));

        await harness.engine.activate('sequence-1');

        expect(harness.schedule()).toMatchObject({
            failure: 'Cannot start sequence action: Unknown action: implement',
            status: 'failed',
        });
    });

    it('cancels current action when sequence is deleted', async () => {
        const harness = createHarness(createSequence());
        await harness.engine.activate('sequence-1');

        await harness.engine.cancel('sequence-1');

        expect(harness.actionRunnerService.cancel).toHaveBeenCalledWith('run-1');
        expect(harness.schedule().status).toBe('cancelled');
    });
});
