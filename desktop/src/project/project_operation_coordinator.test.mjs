import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ProjectOperationCoordinator } = require('./project_operation_coordinator');

function deferred() {
    let resolve;
    const promise = new Promise((complete) => { resolve = complete; });

    return { promise, resolve };
}

describe('ProjectOperationCoordinator', () => {
    it('serializes operations for one project', async () => {
        const coordinator = new ProjectOperationCoordinator();
        const firstRelease = deferred();
        const firstStarted = deferred();
        const calls = [];
        const first = coordinator.run('C:/project', async () => {
            calls.push('first-start');
            firstStarted.resolve();
            await firstRelease.promise;
            calls.push('first-end');
        });
        await firstStarted.promise;
        const second = coordinator.run('C:/project', async () => { calls.push('second'); });

        await Promise.resolve();
        expect(calls).toEqual(['first-start']);
        firstRelease.resolve();
        await Promise.all([first, second]);

        expect(calls).toEqual(['first-start', 'first-end', 'second']);
    });

    it('does not block operations for different projects', async () => {
        const coordinator = new ProjectOperationCoordinator();
        const firstRelease = deferred();
        const first = coordinator.run('C:/first', () => firstRelease.promise);
        const second = coordinator.run('C:/second', async () => 'completed');

        await expect(second).resolves.toBe('completed');
        firstRelease.resolve();
        await first;
    });
});
