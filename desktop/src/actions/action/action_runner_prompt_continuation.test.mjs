import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRunnerService } = require('./action_runner_service');
const { ActionPromptQueueClosedError } = require('./action_prompt_queue_closed_error');

const context = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' };
const conversationId = 'conversation-1';
const reference = `design/activity/card__card-1.json#conversation=${conversationId}`;

function createRunner() {
    const localGitService = { activityConversationReference: vi.fn(() => reference) };
    const runner = new ActionRunnerService({ localGitService });
    runner.projectFolder = 'design';

    return { localGitService, runner };
}

/** A finalizing predecessor: its own queue is closed while its completion is still pending. */
function closingRun(runId = 'run-1', overrides = {}) {
    const completion = Promise.withResolvers();
    const run = {
        activeConversationId: conversationId,
        activityOrigin: { cardInternalId: 'card-1', kind: 'card' },
        completion: completion.promise,
        context,
        diagramPath: null,
        enqueueAgentPrompt: vi.fn(async () => { throw new ActionPromptQueueClosedError(runId); }),
        publish: vi.fn(),
        rootAction: { id: 'review', type: 'agent' },
        rootAgentConversationId: conversationId,
        runId,
        runInput: { agent: 'claude', extraPrompt: '', model: 'opus', prompt: 'First', thinkingLevel: 'high' },
        version: undefined,
        ...overrides,
    };

    return { completeWith: completion.resolve, run };
}

function acceptingRun(runId) {
    return {
        enqueueAgentPrompt: vi.fn(async (content, id) => ({ content, dispatchState: 'queued', id, revision: 0 })),
        runId,
    };
}

function continuationFailures(run) {
    return run.publish.mock.calls
        .map(([, , , details]) => details.update)
        .filter(({ kind }) => kind === 'agentContinuationFailed');
}

describe('ActionRunnerService prompt continuation', () => {
    it('accepts a prompt after the run queue closes and keeps its submission ID', async () => {
        const { runner } = createRunner();
        const { run } = closingRun();
        runner.runs.set(run.runId, run);
        const start = vi.spyOn(runner, 'start');

        await expect(runner.enqueueAgentPrompt(run.runId, 'Continue', 'submission-1')).resolves.toEqual({content: 'Continue', dispatchState: 'deferred', id: 'submission-1', revision: 0});
        expect(start).not.toHaveBeenCalled();
    });

    it('starts the successor only after the predecessor finalizes, with the same conversation, action, and context', async () => {
        const { localGitService, runner } = createRunner();
        const { completeWith, run } = closingRun();
        runner.runs.set(run.runId, run);
        const successor = acceptingRun('run-2');
        const start = vi.spyOn(runner, 'start').mockImplementation(async () => {
            runner.runs.set(successor.runId, successor);
            return successor.runId;
        });

        await runner.enqueueAgentPrompt(run.runId, 'Continue', 'submission-1');
        await Promise.resolve();
        expect(start).not.toHaveBeenCalled();

        runner.runs.delete(run.runId);
        completeWith({ changedPaths: [], failure: null, runId: run.runId, status: 'completed' });
        await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());

        expect(localGitService.activityConversationReference).toHaveBeenCalledWith('design', run.activityOrigin, conversationId);
        expect(start).toHaveBeenCalledWith({
            actionId: 'review',
            context,
            runInput: {
                agent: 'claude', continueFrom: reference, conversationId, model: 'opus', prompt: 'Continue',
                submissionId: 'submission-1', thinkingLevel: 'high',
            },
        }, { continuationPrompt: { content: 'Continue', dispatchState: 'queued', id: 'submission-1', revision: 0 } });
        expect(continuationFailures(run)).toEqual([]);
    });

    it('forwards later prompts for the finalized predecessor to its successor in submission order', async () => {
        const { runner } = createRunner();
        const { completeWith, run } = closingRun();
        runner.runs.set(run.runId, run);
        const successor = acceptingRun('run-2');
        const startup = Promise.withResolvers();
        vi.spyOn(runner, 'start').mockImplementation(async () => {
            await startup.promise;
            runner.runs.set(successor.runId, successor);
            return successor.runId;
        });

        await runner.enqueueAgentPrompt(run.runId, 'First', 'submission-1');
        runner.runs.delete(run.runId);
        completeWith({ changedPaths: [], failure: null, runId: run.runId, status: 'completed' });
        await expect(runner.enqueueAgentPrompt(run.runId, 'Second', 'submission-2')).resolves.toMatchObject({ dispatchState: 'deferred' });
        startup.resolve();
        await vi.waitFor(() => expect(successor.enqueueAgentPrompt).toHaveBeenCalledWith('Second', 'submission-2'));

        await expect(runner.enqueueAgentPrompt(run.runId, 'Third', 'submission-3')).resolves.toMatchObject({ dispatchState: 'queued' });
        expect(successor.enqueueAgentPrompt.mock.calls.map(([content]) => content)).toEqual(['Second', 'Third']);

        await runner.finalizeRun(successor, Promise.resolve({ changedPaths: [], failure: null, runId: successor.runId, status: 'completed' }));
        await expect(runner.enqueueAgentPrompt(run.runId, 'Late', 'submission-4')).rejects.toThrow('Unknown action run: run-1');
    });

    it('fails deferred prompts clearly when the predecessor was cancelled', async () => {
        const { runner } = createRunner();
        const { completeWith, run } = closingRun();
        runner.runs.set(run.runId, run);
        const start = vi.spyOn(runner, 'start');

        await runner.enqueueAgentPrompt(run.runId, 'Continue', 'submission-1');
        completeWith({ changedPaths: [], failure: null, runId: run.runId, status: 'cancelled' });

        await vi.waitFor(() => expect(continuationFailures(run)).toEqual([
            { kind: 'agentContinuationFailed', message: 'Action cancelled before the queued prompt was sent', promptId: 'submission-1' },
        ]));
        expect(start).not.toHaveBeenCalled();
    });

    it('fails every deferred prompt when the successor cannot start', async () => {
        const { runner } = createRunner();
        const { completeWith, run } = closingRun();
        runner.runs.set(run.runId, run);
        vi.spyOn(runner, 'start').mockRejectedValue(new Error('Action runner has no project'));

        await runner.enqueueAgentPrompt(run.runId, 'First', 'submission-1');
        await runner.enqueueAgentPrompt(run.runId, 'Second', 'submission-2');
        completeWith({ changedPaths: [], failure: null, runId: run.runId, status: 'completed' });

        await vi.waitFor(() => expect(continuationFailures(run).map(({ promptId }) => promptId)).toEqual(['submission-1', 'submission-2']));
        expect(continuationFailures(run)[0].message).toBe('Action runner has no project');
        expect(runner.promptContinuations.size).toBe(0);
    });

    it.each([
        ['a restart is in progress', {}, true],
        ['the root agent has no conversation', { rootAgentConversationId: null }, false],
        ['the prompt targets a linked agent conversation', { activeConversationId: 'linked-conversation' }, false],
        ['the run iterates records', { runInput: { forEach: { dataPath: 'items', value: [] } } }, false],
    ])('keeps the closed-queue error when %s', async (_case, overrides, restarting) => {
        const { runner } = createRunner();
        const { run } = closingRun('run-1', overrides);
        runner.runs.set(run.runId, run);
        if (restarting) runner.restartingRuns.add(run.runId);

        await expect(runner.enqueueAgentPrompt(run.runId, 'Continue', 'submission-1')).rejects.toBeInstanceOf(ActionPromptQueueClosedError);
        expect(runner.promptContinuations.size).toBe(0);
    });
});
