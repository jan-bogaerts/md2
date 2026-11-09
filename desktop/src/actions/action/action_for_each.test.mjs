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

    it('selects an array inside a root object through a nested path', () => {
        const root = { data: { items: [{ id: 1 }, { id: 2 }] } };
        expect(forEachRecords(root, 'data.items')).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('traverses numeric array indexes in the selector', () => {
        const root = { countries: [{ cities: ['Brussels', 'Ghent'] }] };
        expect(forEachRecords(root, 'countries.0.cities')).toEqual(['Brussels', 'Ghent']);
    });

    it('returns no records for an empty selected array', () => {
        expect(forEachRecords({ items: [] }, 'items')).toEqual([]);
    });

    it('keeps a root object as one record for a blank selector', () => {
        const root = { items: [1, 2] };
        expect(forEachRecords(root, '')).toEqual([root]);
        expect(forEachRecords(root, '   ')).toEqual([root]);
    });

    it('iterates a root array directly and ignores any selector', () => {
        expect(forEachRecords([1, 2], 'items')).toEqual([1, 2]);
    });

    it('fails missing and non-array selectors', () => {
        expect(() => forEachRecords({ items: [] }, 'missing')).toThrow('Missing for-each data path: missing');
        expect(() => forEachRecords({ items: { id: 1 } }, 'items')).toThrow('For-each data path is not a list: items');
    });

    it('retains a configured data path and rejects a non-string one', () => {
        const config = { dataPath: 'items', failurePolicy: 'logAndContinue', fileName: 'data.json', mode: 'addPrompt', value: { items: [] } };
        expect(validateForEachConfig(config)).toEqual({ ...config, startIndex: 0 });
        expect(() => validateForEachConfig({ ...config, dataPath: 1 })).toThrow('Invalid forEach.dataPath');
    });

    it('omits the data path from configurations without one', () => {
        const config = { failurePolicy: 'logAndContinue', fileName: 'data.json', mode: 'addPrompt', value: [] };
        expect(validateForEachConfig(config)).not.toHaveProperty('dataPath');
    });

    it('defaults a missing start index to zero and retains a valid start index', () => {
        const config = { failurePolicy: 'logAndContinue', fileName: 'data.json', mode: 'addPrompt', value: [] };

        expect(validateForEachConfig(config)).toMatchObject({ startIndex: 0 });
        expect(validateForEachConfig({ ...config, startIndex: 2 })).toMatchObject({ startIndex: 2 });
    });

    it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2', null])('rejects invalid start index %s', (startIndex) => {
        const config = { failurePolicy: 'logAndContinue', fileName: 'data.json', mode: 'addPrompt', startIndex, value: [] };

        expect(() => validateForEachConfig(config)).toThrow('Invalid forEach.startIndex');
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
