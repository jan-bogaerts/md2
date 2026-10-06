import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { cancelUnfinishedTools } = require('./cancel_unfinished_tools');

describe('cancelUnfinishedTools', () => {
    it.each(['inProgress', 'running', 'started'])('cancels an unfinished tool with status %s without losing output', (status) => {
        const tool = { content: 'Tests passed', kind: 'event', status, type: 'commandExecution' };
        const conversation = { entries: [tool] };

        expect(cancelUnfinishedTools(conversation).entries).toEqual([{ ...tool, status: 'cancelled' }]);
        expect(tool.status).toBe(status);
    });

    it('preserves terminal tools and other transcript entries', () => {
        const entries = [
            { kind: 'event', status: 'completed', type: 'commandExecution' },
            { kind: 'event', status: 'failed', type: 'tool.Bash' },
            { kind: 'event', status: 'inProgress', type: 'reasoning' },
            { kind: 'message', role: 'assistant', content: 'done' },
        ];

        expect(cancelUnfinishedTools({ entries }).entries).toEqual(entries);
    });

    it('clears running child counts on cancelled collaboration tools', () => {
        const tool = { kind: 'event', runningSubThreads: 2, status: 'inProgress', type: 'collabAgentToolCall' };

        expect(cancelUnfinishedTools({ entries: [tool] }).entries[0]).toMatchObject({ runningSubThreads: 0, status: 'cancelled' });
    });
});
