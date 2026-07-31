const DEFAULT_CAPTURE_INTERVAL_MS = 250;

function sameProcess(first, second) {
    return first.pid === second.pid && first.creationTime === second.creationTime;
}

class OwnedProcessTracker {
    constructor(dependencies) {
        if (!Number.isInteger(dependencies.rootPid) || dependencies.rootPid <= 0) throw new Error('Missing owned process root PID');
        if (typeof dependencies.owner !== 'string' || dependencies.owner.length === 0) throw new Error('Missing process owner');
        this.captureIntervalMs = dependencies.captureIntervalMs ?? DEFAULT_CAPTURE_INTERVAL_MS;
        this.captureQueue = Promise.resolve();
        this.clearInterval = dependencies.clearInterval ?? clearInterval;
        this.currentProcesses = [];
        this.interval = null;
        this.listProcesses = dependencies.listProcesses;
        this.owner = dependencies.owner;
        this.ownedProcesses = new Map();
        this.rootPid = dependencies.rootPid;
        this.rootIdentityChecked = false;
        this.setInterval = dependencies.setInterval ?? setInterval;
        this.terminateProcess = dependencies.terminateProcess;
        this.handleCaptureError = this.handleCaptureError.bind(this);
        this.handleInterval = this.handleInterval.bind(this);
    }

    start() {
        if (this.interval !== null) return this.captureQueue;
        this.interval = this.setInterval(this.handleInterval, this.captureIntervalMs);

        return this.capture();
    }

    capture() {
        const capture = this.captureQueue.then(() => this.captureNow());
        this.captureQueue = capture.catch(this.handleCaptureError);

        return this.captureQueue;
    }

    async captureNow() {
        const processes = await this.listProcesses();
        this.currentProcesses = processes;
        const currentOwnedProcesses = processes.filter((processRecord) => {
            const ownedProcess = this.ownedProcesses.get(processRecord.pid);

            return ownedProcess && sameProcess(processRecord, ownedProcess);
        });
        const rootProcess = processes.find(({ pid }) => pid === this.rootPid);
        if (!this.rootIdentityChecked && rootProcess) {
            this.ownedProcesses.set(rootProcess.pid, rootProcess);
            currentOwnedProcesses.push(rootProcess);
        }
        this.rootIdentityChecked = true;
        const ownedPids = new Set(currentOwnedProcesses.map(({ pid }) => pid));
        let foundDescendant = true;
        while (foundDescendant) {
            foundDescendant = false;
            for (const processRecord of processes) {
                if (!ownedPids.has(processRecord.parentPid) || ownedPids.has(processRecord.pid)) continue;
                ownedPids.add(processRecord.pid);
                this.ownedProcesses.set(processRecord.pid, processRecord);
                foundDescendant = true;
            }
        }
    }

    stop() {
        if (this.interval === null) return;
        this.clearInterval(this.interval);
        this.interval = null;
    }

    async terminate(includeRoot) {
        this.stop();
        await this.captureQueue;
        try {
            await this.capture();
        } catch {
            // Last successful snapshot remains usable.
        }
        const ownedProcesses = this.currentProcesses.filter((processRecord) => {
            const ownedProcess = this.ownedProcesses.get(processRecord.pid);

            return ownedProcess && sameProcess(processRecord, ownedProcess) && (includeRoot || processRecord.pid !== this.rootPid);
        });
        const rootTerminated = ownedProcesses.some(({ pid }) => pid === this.rootPid);
        if (ownedProcesses.length > 0) {
            console.warn('[process-owner:terminate]', {
                owner: this.owner,
                processes: ownedProcesses.map(({ creationTime, name, parentPid, pid }) => ({ creationTime, name, parentPid, pid })),
                timestamp: new Date().toISOString(),
            });
        }
        for (const { pid } of ownedProcesses.reverse()) {
            try {
                await this.terminateProcess(pid);
            } catch {
                // Process already exited.
            }
        }
        this.ownedProcesses.clear();

        return rootTerminated;
    }

    handleCaptureError(error) {
        console.warn('[process-owner:capture-failed]', {
            message: error instanceof Error ? error.message : String(error),
            owner: this.owner,
            rootPid: this.rootPid,
        });
    }

    handleInterval() {
        void this.capture();
    }
}

module.exports = { OwnedProcessTracker, sameProcess };
