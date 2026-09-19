function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

class ScheduledCardSequenceEngine {
    constructor(dependencies) {
        this.actionRunnerService = dependencies.actionRunnerService;
        this.allocateRunId = dependencies.allocateRunId;
        this.isCurrent = dependencies.isCurrent;
        this.loadSchedules = dependencies.loadSchedules;
        this.resolveCardContext = dependencies.resolveCardContext;
        this.saveSequence = dependencies.saveSequence;
        this.states = dependencies.states;
        this.operations = new Map();
        this.runCompletions = new Map();
    }

    activate(scheduleId) {
        return this.enqueue(scheduleId, () => this.activateSafely(scheduleId));
    }

    handleCardStateChange(cardInternalId, state) {
        return this.handleCardStateChangeNow(cardInternalId, state);
    }

    async handleCardStateChangeNow(cardInternalId, state) {
        const schedules = await this.loadSchedules();
        const matchingSchedules = schedules.filter((schedule) => (
            schedule.kind === 'sequence'
            && schedule.status === 'running'
            && schedule.cardInternalIds[schedule.currentIndex] === cardInternalId
            && schedule.readyState === state
        ));

        for (const schedule of matchingSchedules) {
            await this.enqueue(schedule.id, () => this.markReadyStateMet(schedule.id));
        }
    }

    async cancel(scheduleId) {
        const runId = await this.enqueue(scheduleId, () => this.cancelLocked(scheduleId));
        const completion = runId ? this.runCompletions.get(runId) : null;
        if (completion) await completion;
    }

    async cancelLocked(scheduleId) {
        const schedules = await this.loadSchedules();
        const schedule = schedules.find((candidate) => candidate.id === scheduleId);
        if (!schedule || schedule.kind !== 'sequence' || !schedule.currentRunId) return;
        try {
            this.actionRunnerService.cancel(schedule.currentRunId);
        } catch (error) {
            if (!errorMessage(error).startsWith('Unknown action run:')) throw error;
        }

        return schedule.currentRunId;
    }

    enqueue(scheduleId, operation) {
        const previous = this.operations.get(scheduleId) ?? Promise.resolve();
        const current = ScheduledCardSequenceEngine.runQueued(previous, operation);
        this.operations.set(scheduleId, current);
        void this.clearQueued(scheduleId, current);

        return current;
    }

    static async runQueued(previous, operation) {
        try {
            await previous;
        } catch {
            // Later persisted transitions must still run after one failed operation.
        }

        return operation();
    }

    async clearQueued(scheduleId, operation) {
        try {
            await operation;
        } catch {
            // Caller owns operation failure.
        }
        if (this.operations.get(scheduleId) === operation) this.operations.delete(scheduleId);
    }

    async activateLocked(scheduleId) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || !this.isCurrent()) return;
        if (schedule.status !== 'pending' && schedule.status !== 'running') return;
        this.validateReadyState(schedule);
        let current = schedule;
        if (current.status === 'pending') {
            current = await this.saveSequence({ ...current, failure: null, status: 'running' });
        }
        current = await this.refreshReadyState(current);
        if (current.actionCompleted && current.readyStateMet) {
            await this.advanceOrComplete(current);
            return;
        }
        if (current.currentRunId) {
            this.observeRun(current.id, current.currentRunId);
            return;
        }
        if (!current.actionCompleted) await this.startCurrentAction(current);
    }

    async activateSafely(scheduleId) {
        try {
            await this.activateLocked(scheduleId);
        } catch (error) {
            const schedule = await this.loadSequence(scheduleId);
            if (!schedule || (schedule.status !== 'pending' && schedule.status !== 'running') || !this.isCurrent()) return;
            await this.failSequence(schedule, errorMessage(error));
        }
    }

    async refreshReadyState(schedule) {
        if (schedule.readyStateMet) return schedule;
        const context = await this.resolveCardContext(schedule.cardInternalIds[schedule.currentIndex]);
        if (context.state !== schedule.readyState) return schedule;

        return this.saveSequence({ ...schedule, readyStateMet: true });
    }

    async startCurrentAction(schedule) {
        const context = await this.resolveCardContext(schedule.cardInternalIds[schedule.currentIndex]);
        const runId = this.allocateRunId();
        const activeSchedule = await this.saveSequence({ ...schedule, currentRunId: runId });
        if (!this.isCurrent()) return;
        try {
            await this.actionRunnerService.start(
                { actionId: activeSchedule.actionId, context, runInput: {} },
                { interactive: false, runId },
            );
        } catch (error) {
            await this.failSequence(activeSchedule, `Cannot start sequence action: ${errorMessage(error)}`);
            return;
        }
        this.observeRun(activeSchedule.id, runId);
    }

    observeRun(scheduleId, runId) {
        if (this.runCompletions.has(runId)) return;
        const completion = this.observeRunNow(scheduleId, runId);
        this.runCompletions.set(runId, completion);
        void this.clearRunCompletion(runId, completion);
    }

    async observeRunNow(scheduleId, runId) {
        try {
            const result = await this.actionRunnerService.wait(runId);
            await this.enqueue(scheduleId, () => this.applyRunResult(scheduleId, runId, result));
        } catch (error) {
            await this.enqueue(scheduleId, () => this.failUnrecoverableRun(scheduleId, runId, error));
        }
    }

    async clearRunCompletion(runId, completion) {
        await completion;
        if (this.runCompletions.get(runId) === completion) this.runCompletions.delete(runId);
    }

    async applyRunResult(scheduleId, runId, result) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running' || schedule.currentRunId !== runId || !this.isCurrent()) return;
        if (result.status === 'cancelled') {
            await this.saveSequence({ ...schedule, currentRunId: null, failure: result.failure ?? 'Sequence action was cancelled', status: 'cancelled' });
            return;
        }
        if (result.status !== 'completed') {
            await this.failSequence(schedule, result.failure ?? `Sequence action ended with status ${result.status}`);
            return;
        }
        const completed = await this.saveSequence({ ...schedule, actionCompleted: true, currentRunId: null });
        if (completed.readyStateMet) await this.advanceOrComplete(completed);
    }

    async failUnrecoverableRun(scheduleId, runId, error) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running' || schedule.currentRunId !== runId || !this.isCurrent()) return;
        await this.failSequence(schedule, `Cannot recover sequence action run ${runId}: ${errorMessage(error)}`);
    }

    async markReadyStateMet(scheduleId) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running' || schedule.readyStateMet || !this.isCurrent()) return;
        const ready = await this.saveSequence({ ...schedule, readyStateMet: true });
        if (ready.actionCompleted) await this.advanceOrComplete(ready);
    }

    async advanceOrComplete(schedule) {
        const lastIndex = schedule.cardInternalIds.length - 1;
        if (schedule.currentIndex === lastIndex) {
            await this.saveSequence({ ...schedule, failure: null, status: 'completed' });
            return;
        }
        const next = await this.saveSequence({
            ...schedule,
            actionCompleted: false,
            currentIndex: schedule.currentIndex + 1,
            currentRunId: null,
            readyStateMet: false,
        });
        const refreshed = await this.refreshReadyState(next);
        await this.startCurrentAction(refreshed);
    }

    async failSequence(schedule, failure) {
        await this.saveSequence({ ...schedule, currentRunId: null, failure, status: 'failed' });
    }

    async loadSequence(scheduleId) {
        const schedules = await this.loadSchedules();

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.kind === 'sequence') ?? null;
    }

    validateReadyState(schedule) {
        if (!this.states.includes(schedule.readyState)) {
            throw new Error(`Sequence ready state is not configured: ${schedule.readyState}`);
        }
    }
}

module.exports = { ScheduledCardSequenceEngine };
