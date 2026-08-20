const path = require('node:path');
const { Worker } = require('node:worker_threads');

class ProjectStatsWorkerService {
    constructor() {
        this.calculations = new Map();
    }

    calculate(rootPath, paths, calculationId) {
        if (typeof rootPath !== 'string' || rootPath.length === 0) throw new Error('Missing local project root path');
        if (!Array.isArray(paths)) throw new Error('Stats source paths must be an array');
        if (typeof calculationId !== 'string' || calculationId.length === 0) throw new Error('Missing stats calculation ID');
        if (this.calculations.has(calculationId)) throw new Error(`Stats calculation already exists: ${calculationId}`);
        const workerPath = path.join(__dirname, 'project_stats_worker.mjs');
        const worker = new Worker(workerPath, { workerData: { paths, rootPath } });

        return new Promise((resolve, reject) => {
            const calculation = { reject, worker };
            this.calculations.set(calculationId, calculation);
            worker.once('message', (message) => {
                if (this.calculations.get(calculationId) !== calculation) return;
                this.calculations.delete(calculationId);
                if (message.error) reject(new Error(message.error));
                else resolve(message.result);
            });
            worker.once('error', (error) => {
                if (this.calculations.get(calculationId) !== calculation) return;
                this.calculations.delete(calculationId);
                reject(error);
            });
            worker.once('exit', (code) => {
                if (code === 0 || this.calculations.get(calculationId) !== calculation) return;
                this.calculations.delete(calculationId);
                reject(new Error(`Stats worker stopped with exit code ${code}`));
            });
        });
    }

    async cancel(calculationId) {
        const calculation = this.calculations.get(calculationId);
        if (!calculation) return;
        this.calculations.delete(calculationId);
        calculation.reject(new Error('Stats calculation cancelled'));
        await calculation.worker.terminate();
    }
}

module.exports = { ProjectStatsWorkerService };
