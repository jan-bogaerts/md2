import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { appendSystemActivityRecord } = require('./system_activity_record');

describe('appendSystemActivityRecord', () => {
    it('records an integration once across retry after history persistence failure', () => {
        const record = { commits: [{ branch: 'sequence', commit: 'abc' }], label: 'Integrate into project', type: 'system' };
        const activity = appendSystemActivityRecord({ records: [] }, record);
        expect(appendSystemActivityRecord(activity, record)).toBe(activity);
        expect(activity.records).toEqual([record]);
    });

    it('retains distinct integrations and system records without commits', () => {
        const record = { commits: [{ branch: 'sequence', commit: 'abc' }], label: 'Integrate into project', type: 'system' };
        const activity = appendSystemActivityRecord({ records: [] }, record);
        const next = appendSystemActivityRecord(activity, { ...record, commits: [{ branch: 'sequence', commit: 'def' }] });
        expect(next.records).toHaveLength(2);
        expect(appendSystemActivityRecord(next, { label: 'Other', type: 'system' }).records).toHaveLength(3);
    });
});
