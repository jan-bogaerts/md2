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

    it('pretty prints a full object record with supported whitespace forms', () => {
        const record = { city: 'Brussels', enabled: true };
        const expected = JSON.stringify(record, null, 2);

        expect(resolveDataPlaceholders('{{data}}\n{{ data }}\n{{data   }}', record))
            .toBe(`${expected}\n${expected}\n${expected}`);
    });

    it.each([
        [['Brussels', 2], '[\n  "Brussels",\n  2\n]'],
        ['Brussels', '"Brussels"'],
        [2, '2'],
        [true, 'true'],
        [null, 'null'],
    ])('serializes full JSON record %j', (record, expected) => {
        expect(resolveDataPlaceholders('{{data}}', record)).toBe(expected);
    });

    it('resolves full-record and path placeholders from the same record', () => {
        const record = { city: 'Brussels', details: { enabled: true } };

        expect(resolveDataPlaceholders('Record: {{data}}\nCity: {{ data city }}\nDetails: {{data details}}', record))
            .toBe(`Record: ${JSON.stringify(record, null, 2)}\nCity: Brussels\nDetails: {"enabled":true}`);
    });

    it('inserts dollar sequences and placeholder-like record content literally', () => {
        const record = { content: '$& $` $\' {{data other}}', other: 'changed' };

        expect(resolveDataPlaceholders('Full: {{data}}\nContent: {{data content}}', record))
            .toBe(`Full: ${JSON.stringify(record, null, 2)}\nContent: $& $\` $' {{data other}}`);
    });

    it('leaves names beginning with data unmatched', () => {
        expect(resolveDataPlaceholders('{{database}} {{data-x}}', { value: 1 }))
            .toBe('{{database}} {{data-x}}');
    });

    it('fails missing paths and rejects malformed configuration', () => {
        expect(() => resolveDataPlaceholders('{{data missing}}', {})).toThrow('Missing for-each data path: missing');
        expect(() => validateForEachConfig({ failurePolicy: 'skip', fileName: 'data.json', mode: 'addPrompt', value: [] }))
            .toThrow('Invalid forEach.failurePolicy');
    });
});
