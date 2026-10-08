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
        this.worktreeExecution = dependencies.worktreeExecution;
        this.reportError = dependencies.reportError ?? console.error;
        this.cancelledSchedules = new Set();
        this.operations = new Map();
        this.runCompletions = new Map();
    }

    activate(scheduleId) {
        return this.enqueue(scheduleId, () => this.activateSafely(scheduleId));
    }

    handleCardStateChange(cardInternalId, state, checkoutPath = null) {
        return this.handleCardStateChangeNow(cardInternalId, state, checkoutPath);
    }

    async handleCardStateChangeNow(cardInternalId, state, checkoutPath) {
        const schedules = await this.loadSchedules();
        const matchingSchedules = schedules.filter((schedule) => (
            schedule.kind === 'sequence'
            && schedule.status === 'running'
            && (schedule.branchProgress?.checkoutPath ?? null) === checkoutPath
            && schedule.cardInternalIds[schedule.currentIndex] === cardInternalId
            && schedule.readyState === state
        ));

        for (const schedule of matchingSchedules) {
            await this.enqueue(schedule.id, () => this.markReadyStateMet(schedule.id, cardInternalId, checkoutPath));
        }
    }

    async cancel(scheduleId) {
        this.cancelledSchedules.add(scheduleId);
        const runId = await this.enqueue(scheduleId, () => this.cancelLocked(scheduleId));
        const completion = runId ? this.runCompletions.get(runId) : null;
        if (completion) await completion;
        this.worktreeExecution?.release(scheduleId);
    }

    async cancelLocked(scheduleId) {
        const schedules = await this.loadSchedules();
        const schedule = schedules.find((candidate) => candidate.id === scheduleId);
        if (!schedule || schedule.kind !== 'sequence') return;
        await this.saveSequence({ ...schedule, status: 'cancelled', failure: 'Sequence cancelled' });
        if (!schedule.currentRunId) return;
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
        if (this.cancelledSchedules.has(scheduleId)) return;
        if (current.worktreeBranch) current = await this.worktreeExecution.prepare(current);
        if (current.branchProgress?.phase === 'finishing' || current.branchProgress?.phase === 'completed') {
            current = await this.worktreeExecution.finish(current);
            await this.saveSequence({ ...current, status: 'completed' });
            this.worktreeExecution.release(current.id);
            return;
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
        if (!current.actionCompleted && current.branchProgress?.phase === 'running') {
            throw new Error('Cannot recover sequence action with unknown run outcome');
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
        const context = await this.resolveCardContext(schedule.cardInternalIds[schedule.currentIndex], schedule);
        if (context.state !== schedule.readyState) return schedule;

        return this.saveSequence({ ...schedule, readyStateMet: true });
    }

    async startCurrentAction(schedule) {
        const context = await this.resolveCardContext(schedule.cardInternalIds[schedule.currentIndex], schedule);
        const runId = this.allocateRunId();
        const activeSchedule = await this.saveSequence({ ...schedule, currentRunId: runId, ...(schedule.branchProgress ? { branchProgress: { ...schedule.branchProgress, phase: 'running', runId } } : {}) });
        if (!this.isCurrent() || this.cancelledSchedules.has(schedule.id)) return;
        try {
            await this.actionRunnerService.start(
                { actionId: activeSchedule.actionId, context, runInput: {} },
                { interactive: false, runId, ...(activeSchedule.worktreeBranch ? { sequenceId: activeSchedule.id } : {}) },
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
        try {
            await completion;
        } catch (error) {
            this.reportError(error);
        }
        if (this.runCompletions.get(runId) === completion) this.runCompletions.delete(runId);
    }

    async applyRunResult(scheduleId, runId, result) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running' || schedule.currentRunId !== runId || !this.isCurrent()) return;
        if (result.status === 'cancelled') {
            await this.saveSequence({ ...schedule, currentRunId: null, failure: result.failure ?? 'Sequence action was cancelled', status: 'cancelled' });
            this.worktreeExecution?.release(schedule.id);
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
        if (!schedule || schedule.status !== 'running' || !this.isCurrent()) return;
        await this.failSequence(schedule, `Cannot recover sequence action run ${runId}: ${errorMessage(error)}`);
    }

    async markReadyStateMet(scheduleId, cardInternalId, checkoutPath) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running' || schedule.readyStateMet || !this.isCurrent()) return;
        if (schedule.cardInternalIds[schedule.currentIndex] !== cardInternalId) return;
        if ((schedule.branchProgress?.checkoutPath ?? null) !== checkoutPath) return;
        const ready = await this.saveSequence({ ...schedule, readyStateMet: true });
        if (ready.actionCompleted) await this.advanceOrComplete(ready);
    }

    async advanceOrComplete(schedule) {
        try {
            await this.advanceOrCompleteNow(schedule);
        } catch (error) {
            if (this.cancelledSchedules.has(schedule.id)) return;
            const current = await this.loadSequence(schedule.id);
            await this.failSequence(current, errorMessage(error));
        }
    }

    async advanceOrCompleteNow(schedule) {
        if (this.cancelledSchedules.has(schedule.id)) return;
        if (schedule.worktreeBranch) schedule = await this.worktreeExecution.integrate(schedule);
        if (this.cancelledSchedules.has(schedule.id)) return;
        const lastIndex = schedule.cardInternalIds.length - 1;
        if (schedule.currentIndex === lastIndex) {
            if (schedule.worktreeBranch) schedule = await this.worktreeExecution.finish(schedule);
            await this.saveSequence({ ...schedule, failure: null, status: 'completed' });
            this.worktreeExecution?.release(schedule.id);
            return;
        }
        const next = await this.saveSequence({
            ...schedule,
            ...(schedule.branchProgress ? { branchProgress: { ...schedule.branchProgress, phase: 'sequence-ready', childBranch: null } } : {}),
            actionCompleted: false,
            currentIndex: schedule.currentIndex + 1,
            currentRunId: null,
            readyStateMet: false,
        });
        const prepared = next.worktreeBranch ? await this.worktreeExecution.prepare(next) : next;
        const refreshed = await this.refreshReadyState(prepared);
        await this.startCurrentAction(refreshed);
    }

    async failSequence(schedule, failure) {
        try {
            await this.saveSequence({ ...schedule, currentRunId: null, failure, status: 'failed' });
            this.reportError(new Error(`Sequence ${schedule.id} failed: ${failure}`));
        } finally {
            this.worktreeExecution?.release(schedule.id);
        }
    }

    recoverHistory(scheduleId) {
        return this.enqueue(scheduleId, () => this.recoverHistoryNow(scheduleId));
    }

    async recoverHistoryNow(scheduleId) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'failed' || !schedule.worktreeBranch) return;
        if (!['integrated', 'recording'].includes(schedule.branchProgress?.phase)) return;
        try {
            const prepared = await this.worktreeExecution.prepare(schedule);
            await this.worktreeExecution.integrate(prepared);
        } finally {
            this.worktreeExecution.release(scheduleId);
        }
    }

    failExternal(scheduleId, error) {
        return this.enqueue(scheduleId, () => this.failExternalNow(scheduleId, error));
    }

    async failExternalNow(scheduleId, error) {
        const schedule = await this.loadSequence(scheduleId);
        if (!schedule || schedule.status !== 'running') return;
        if (schedule.currentRunId) {
            try {
                this.actionRunnerService.cancel(schedule.currentRunId);
            } catch (cancelError) {
                if (!errorMessage(cancelError).startsWith('Unknown action run:')) throw cancelError;
            }
        }
        if (schedule.currentRunId) await this.actionRunnerService.wait(schedule.currentRunId);
        await this.failSequence(schedule, errorMessage(error));
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
