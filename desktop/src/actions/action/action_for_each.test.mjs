import { describe, expect, it } from 'vitest';
import {
    forEachRecords,
    resolveDataPlaceholders,
    validateForEachConfig,
} from '../../../../shared/action_for_each.mjs';

describe('action for-each helpers', () => {
    it('normalizes root objects and arrays into ordered records', () => {
        const object = { id: 1 };
        expect(forEachRecords(object)).toEqual([object]);
        expect(forEachRecords([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
        expect(forEachRecords([])).toEqual([]);
    });

    it('resolves object keys and array indexes and preserves string values', () => {
        const record = { countries: [{ cities: ['Brussels', 'Ghent'] }], enabled: true };
        expect(resolveDataPlaceholders('Visit {{data countries.0.cities}}; enabled={{data enabled}}', record))
            .toBe('Visit ["Brussels","Ghent"]; enabled=true');
        expect(resolveDataPlaceholders('{{data countries.0.cities.1}}', record)).toBe('Ghent');
    });

    it('fails missing paths and rejects malformed configuration', () => {
        expect(() => resolveDataPlaceholders('{{data missing}}', {})).toThrow('Missing for-each data path: missing');
        expect(() => validateForEachConfig({ failurePolicy: 'skip', fileName: 'data.json', mode: 'addPrompt', value: [] }))
            .toThrow('Invalid forEach.failurePolicy');
    });
});
