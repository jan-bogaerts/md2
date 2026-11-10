import { describe, expect, it, vi } from 'vitest';
import { JsonDataDocument } from './json_data_document';

describe('JsonDataDocument', () => {
    it('edits nested values, tracks breadcrumbs, and serializes stable JSON with final newline', () => {
        const document = new JsonDataDocument('data.json', { nested: { enabled: true } }, false);

        document.drillInto('nested');
        document.setCurrentChild('enabled', false);

        expect(document.getSnapshot().location).toEqual(['nested']);
        expect(document.getValue()).toEqual({ enabled: false });
        expect(document.dirty).toBe(true);
        expect(document.serialize()).toBe('{\n  "nested": {\n    "enabled": false\n  }\n}\n');

        document.navigateTo(0);
        expect(document.getValue()).toEqual({ nested: { enabled: false } });
    });

    it('adds object rows only for a non-empty object table and null for other arrays', () => {
        const objects = new JsonDataDocument('objects.json', [{ id: 1 }], false);
        const empty = new JsonDataDocument('empty.json', [], false);
        const mixed = new JsonDataDocument('mixed.json', [{ id: 1 }, 'value'], false);

        objects.addRow();
        empty.addRow();
        mixed.addRow();

        expect(objects.getValue()).toEqual([{ id: 1 }, {}]);
        expect(empty.getValue()).toEqual([null]);
        expect(mixed.getValue()).toEqual([{ id: 1 }, 'value', null]);
    });

    it('copies and cuts selected rows in row order only after clipboard success', async () => {
        const document = new JsonDataDocument('data.json', ['zero', 'one', 'two'], false);
        const writeText = vi.fn(async () => undefined);
        document.setSelectedRows([2, 0]);

        await document.copySelectedRows(writeText);
        expect(writeText).toHaveBeenLastCalledWith('[\n  "zero",\n  "two"\n]');

        writeText.mockRejectedValueOnce(new Error('clipboard denied'));
        await expect(document.cutSelectedRows(writeText)).rejects.toThrow('clipboard denied');
        expect(document.getValue()).toEqual(['zero', 'one', 'two']);

        await document.cutSelectedRows(writeText);
        expect(document.getValue()).toEqual(['one']);
    });

    it('pastes JSON arrays after last selected row and rejects invalid clipboard data unchanged', () => {
        const document = new JsonDataDocument('data.json', [1, 4], false);
        document.setSelectedRows([0]);

        document.pasteRows('[2,3]');
        expect(document.getValue()).toEqual([1, 2, 3, 4]);

        expect(() => document.pasteRows('{"value":5}')).toThrow('must be an array');
        expect(() => document.pasteRows('invalid')).toThrow('valid JSON');
        expect(document.getValue()).toEqual([1, 2, 3, 4]);
    });

    it('blocks every mutation in read-only documents', async () => {
        const document = new JsonDataDocument('data.json', [1], true);

        expect(() => document.addRow()).toThrow('read-only');
        expect(() => document.setValue([0], 2)).toThrow('read-only');
        document.setSelectedRows([0]);
        await expect(document.cutSelectedRows(vi.fn())).rejects.toThrow('read-only');
        expect(() => document.deleteSelectedRows()).toThrow('read-only');
        expect(() => document.pasteRows('[2]')).toThrow('read-only');
        expect(document.getValue()).toEqual([1]);
    });

    it('acknowledges only saved revision and retains newer edits', () => {
        const document = new JsonDataDocument('data.json', 1, false);
        document.setValue([], 2);
        const firstSave = document.createSaveReference();
        document.setValue([], 3);

        firstSave.acknowledge();
        expect(document.dirty).toBe(true);

        document.createSaveReference().acknowledge();
        expect(document.dirty).toBe(false);
    });

    it('keeps numeric input as view state until a valid JSON number is committed', () => {
        const document = new JsonDataDocument('data.json', { value: 1 }, false);

        document.setNumberInput(['value'], '-');
        document.commitNumberInput(['value']);
        expect(document.getValue()).toEqual({ value: 1 });
        expect(document.dirty).toBe(false);
        expect(document.getNumberInput(['value'], 1)).toEqual({ invalid: true, text: '-' });

        document.setNumberInput(['value'], '-1.5e2');
        document.commitNumberInput(['value']);
        expect(document.getValue()).toEqual({ value: -150 });
        expect(document.dirty).toBe(true);
    });
});
