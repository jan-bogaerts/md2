import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { transitionConversationStatus } = require('./agent_conversation');
const {
    addTimerBreakdown,
    createPhaseTracker,
    foldPhases,
    recordPhaseEvent,
    resumePhases,
    suspendPhases,
} = require('./agent_conversation_phases');

const START = '2026-01-01T00:00:00.000Z';

function at(seconds) {
    return new Date(Date.parse(START) + seconds * 1_000).toISOString();
}

function runningConversation() {
    return { status: 'running', timer: { elapsedMs: 0, runningStartedAt: START } };
}

function toolEvent(providerItemId, status) {
    return { providerItemId, status, type: 'commandExecution' };
}

function reasoningEvent(providerItemId, status) {
    return { providerItemId, status, type: 'reasoning' };
}

describe('agent conversation phases', () => {
    it('charges two parallel tools their union, never their sum', () => {
        const phases = createPhaseTracker();
        const conversation = runningConversation();
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(1));
        recordPhaseEvent(phases, toolEvent('tool-b', 'inProgress'), at(2));
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(5));
        recordPhaseEvent(phases, toolEvent('tool-b', 'completed'), at(6));

        transitionConversationStatus(conversation, 'completed', at(10), phases);

        expect(conversation.timer).toEqual({ breakdown: { reasoningMs: 0, toolMs: 5_000 }, elapsedMs: 10_000, runningStartedAt: null });
    });

    it('charges a tool and reasoning overlap to tools, so components never pass the total', () => {
        const phases = createPhaseTracker();
        const conversation = runningConversation();
        recordPhaseEvent(phases, reasoningEvent('think-1', 'inProgress'), at(1));
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(2));
        recordPhaseEvent(phases, reasoningEvent('think-1', 'completed'), at(4));
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(6));

        transitionConversationStatus(conversation, 'completed', at(10), phases);

        const { breakdown, elapsedMs } = conversation.timer;
        expect(breakdown).toEqual({ reasoningMs: 1_000, toolMs: 4_000 });
        expect(breakdown.reasoningMs + breakdown.toolMs).toBeLessThanOrEqual(elapsedMs);
    });

    it('counts only the worked time of a tool parked on its approval', () => {
        const phases = createPhaseTracker();
        const conversation = runningConversation();
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(1));
        // The approval pause leaves `running`, so both the total and the tool span stop here.
        transitionConversationStatus(conversation, 'waitingForInput', at(3), phases);
        transitionConversationStatus(conversation, 'running', at(60), phases);
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(62));
        transitionConversationStatus(conversation, 'completed', at(64), phases);

        expect(conversation.timer).toEqual({ breakdown: { reasoningMs: 0, toolMs: 4_000 }, elapsedMs: 7_000, runningStartedAt: null });
    });

    it('closes a span still open at cancellation at the transition timestamp', () => {
        const phases = createPhaseTracker();
        const conversation = runningConversation();
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(2));

        transitionConversationStatus(conversation, 'cancelled', at(9), phases);

        expect(conversation.timer).toEqual({ breakdown: { reasoningMs: 0, toolMs: 7_000 }, elapsedMs: 9_000, runningStartedAt: null });
    });

    it('does not charge a live fold twice when the running period later closes', () => {
        const phases = createPhaseTracker();
        const conversation = runningConversation();
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(1));
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(4));
        conversation.timer = addTimerBreakdown(conversation.timer, foldPhases(phases, Date.parse(START), Date.parse(at(4))));

        expect(conversation.timer.breakdown).toEqual({ reasoningMs: 0, toolMs: 3_000 });

        transitionConversationStatus(conversation, 'completed', at(10), phases);

        expect(conversation.timer).toEqual({ breakdown: { reasoningMs: 0, toolMs: 3_000 }, elapsedMs: 10_000, runningStartedAt: null });
    });

    it('accumulates on the breakdown a continued conversation already stored', () => {
        const phases = createPhaseTracker();
        const conversation = { status: 'waitingForInput', timer: { breakdown: { reasoningMs: 500, toolMs: 2_000 }, elapsedMs: 8_000, runningStartedAt: null } };
        transitionConversationStatus(conversation, 'running', START, phases);
        recordPhaseEvent(phases, toolEvent('tool-a', 'inProgress'), at(1));
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(3));

        transitionConversationStatus(conversation, 'completed', at(4), phases);

        expect(conversation.timer).toEqual({ breakdown: { reasoningMs: 500, toolMs: 4_000 }, elapsedMs: 12_000, runningStartedAt: null });
    });

    it('leaves the timer unmeasured when no tracker is passed', () => {
        const conversation = runningConversation();

        transitionConversationStatus(conversation, 'completed', at(10));

        expect(conversation.timer).toEqual({ elapsedMs: 10_000, runningStartedAt: null });
        expect(conversation.timer).not.toHaveProperty('breakdown');
    });

    it('ignores an item whose first event is already terminal and events that open no span', () => {
        const phases = createPhaseTracker();
        recordPhaseEvent(phases, toolEvent('tool-a', 'completed'), at(1));
        recordPhaseEvent(phases, { providerItemId: 'text-1', status: 'inProgress', type: 'agentMessage' }, at(1));
        recordPhaseEvent(phases, { providerItemId: 'text-1', status: 'completed', type: 'agentMessage' }, at(5));

        expect(foldPhases(phases, Date.parse(START), Date.parse(at(10)))).toEqual({ reasoningMs: 0, toolMs: 0 });
    });

    it('suspends and resumes an open span without losing it', () => {
        const phases = createPhaseTracker();
        recordPhaseEvent(phases, reasoningEvent('think-1', 'inProgress'), at(1));
        suspendPhases(phases, Date.parse(at(3)));
        resumePhases(phases, Date.parse(at(20)));
        recordPhaseEvent(phases, reasoningEvent('think-1', 'completed'), at(23));

        expect(foldPhases(phases, Date.parse(START), Date.parse(at(30)))).toEqual({ reasoningMs: 5_000, toolMs: 0 });
    });
});
