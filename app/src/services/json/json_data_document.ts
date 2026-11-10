import type { OpenDocumentChangedDetail, OpenDocumentOrigin, OpenDocumentSaveReference } from '../open_document';
import { isJsonObject, type JsonLocationSegment, type JsonValue } from './json_types';

export interface JsonDataDocumentSnapshot {
    data: JsonValue;
    dirty: boolean;
    externalConflict: boolean;
    location: readonly JsonLocationSegment[];
    numberInputs: ReadonlyMap<string, JsonNumberInput>;
    selectedRows: readonly number[];
    unavailableReason: string | null;
}

export interface JsonNumberInput {
    invalid: boolean;
    text: string;
}

const JSON_NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

function locationKey(location: readonly JsonLocationSegment[]) {
    return JSON.stringify(location);
}

function valueAt(data: JsonValue, location: readonly JsonLocationSegment[]) {
    let value = data;
    for (const segment of location) {
        if (Array.isArray(value) && typeof segment === 'number' && segment >= 0 && segment < value.length) {
            value = value[segment];
            continue;
        }
        if (isJsonObject(value) && typeof segment === 'string' && Object.hasOwn(value, segment)) {
            value = value[segment];
            continue;
        }

        return undefined;
    }

    return value;
}

function replaceAt(data: JsonValue, location: readonly JsonLocationSegment[], replacement: JsonValue): JsonValue {
    if (location.length === 0) return replacement;

    const [segment, ...remaining] = location;
    if (Array.isArray(data) && typeof segment === 'number' && segment >= 0 && segment < data.length) {
        return data.map((value, index) => index === segment ? replaceAt(value, remaining, replacement) : value);
    }
    if (isJsonObject(data) && typeof segment === 'string' && Object.hasOwn(data, segment)) {
        return { ...data, [segment]: replaceAt(data[segment], remaining, replacement) };
    }

    throw new Error(`JSON location no longer exists: ${location.join('.')}`);
}

function existingLocation(data: JsonValue, location: readonly JsonLocationSegment[]) {
    const existing: JsonLocationSegment[] = [];
    for (const segment of location) {
        if (valueAt(data, [...existing, segment]) === undefined) break;
        existing.push(segment);
    }

    return existing;
}

function sortedSelection(selection: ReadonlySet<number>, rowCount: number) {
    return [...selection].filter((index) => index >= 0 && index < rowCount).sort((first, second) => first - second);
}

/** Owns one parsed JSON draft, navigation location, row selection, and revision-based save state. */
export class JsonDataDocument extends EventTarget {
    readonly kind = 'json' as const;
    readonly path: string;
    readonly readOnly: boolean;
    private acknowledgedRevision = 0;
    private data: JsonValue;
    private editRevision = 0;
    private externalConflict = false;
    private location: JsonLocationSegment[] = [];
    private readonly numberInputs = new Map<string, JsonNumberInput>();
    private selectedRows = new Set<number>();
    private snapshot: JsonDataDocumentSnapshot;
    private unavailableReason: string | null = null;

    constructor(path: string, data: JsonValue, readOnly: boolean) {
        super();
        this.path = path;
        this.data = data;
        this.readOnly = readOnly;
        this.snapshot = this.createSnapshot();
    }

    get dirty() { return this.editRevision !== this.acknowledgedRevision; }

    getSnapshot = () => this.snapshot;

    getDraft() {
        return this.data;
    }

    getObject() {
        return { path: this.path };
    }

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener);

        return () => this.removeEventListener('changed', listener);
    };

    getValue() {
        const value = valueAt(this.data, this.location);
        if (value === undefined) throw new Error(`JSON location no longer exists: ${this.location.join('.')}`);

        return value;
    }

    getValueAt(location: readonly JsonLocationSegment[]) {
        return valueAt(this.data, location);
    }

    getNumberInput(location: readonly JsonLocationSegment[], value: number) {
        return this.numberInputs.get(locationKey(location)) ?? { invalid: false, text: String(value) };
    }

    drillInto(segment: JsonLocationSegment) {
        const nextLocation = [...this.location, segment];
        const value = valueAt(this.data, nextLocation);
        if (value === undefined) throw new Error(`Cannot open missing JSON value: ${nextLocation.join('.')}`);
        if (value === null || typeof value !== 'object') throw new Error('Only JSON objects and arrays can be opened');

        this.location = nextLocation;
        this.numberInputs.clear();
        this.selectedRows.clear();
        this.publish();
    }

    navigateTo(depth: number) {
        if (!Number.isInteger(depth) || depth < 0 || depth > this.location.length) {
            throw new Error(`Invalid JSON breadcrumb depth: ${depth}`);
        }
        if (depth === this.location.length) return;

        this.location = this.location.slice(0, depth);
        this.numberInputs.clear();
        this.selectedRows.clear();
        this.publish();
    }

    setNumberInput(location: readonly JsonLocationSegment[], text: string) {
        this.requireWritable();
        this.numberInputs.set(locationKey(location), { invalid: false, text });
        this.publish();
    }

    commitNumberInput(location: readonly JsonLocationSegment[], origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const key = locationKey(location);
        const input = this.numberInputs.get(key);
        if (!input) return;

        const nextValue = Number(input.text);
        if (!JSON_NUMBER_PATTERN.test(input.text) || !Number.isFinite(nextValue)) {
            this.numberInputs.set(key, { ...input, invalid: true });
            this.publish();
            return;
        }

        this.numberInputs.delete(key);
        this.setValue(location, nextValue, origin);
    }

    resetNumberInput(location: readonly JsonLocationSegment[]) {
        if (!this.numberInputs.delete(locationKey(location))) return;

        this.publish();
    }

    setSelectedRows(rows: readonly number[]) {
        const value = this.getValue();
        if (!Array.isArray(value)) throw new Error('Rows can only be selected for a JSON array');

        const selection = sortedSelection(new Set(rows), value.length);
        if (selection.length === this.selectedRows.size && selection.every((row) => this.selectedRows.has(row))) return;

        this.selectedRows = new Set(selection);
        this.publish();
    }

    setValue(location: readonly JsonLocationSegment[], value: JsonValue, origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const nextData = replaceAt(this.data, location, value);
        this.applyEdit(nextData, origin);
    }

    setCurrentChild(segment: JsonLocationSegment, value: JsonValue, origin: OpenDocumentOrigin = null) {
        this.setValue([...this.location, segment], value, origin);
    }

    addRow(origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const current = this.requireCurrentArray();
        const objectTable = current.length > 0 && current.every(isJsonObject);
        this.applyEdit(replaceAt(this.data, this.location, [...current, objectTable ? {} : null]), origin);
    }

    deleteSelectedRows(origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const current = this.requireCurrentArray();
        const selectedRows = sortedSelection(this.selectedRows, current.length);
        if (selectedRows.length === 0) return;

        const selected = new Set(selectedRows);
        const nextArray = current.filter((_value, index) => !selected.has(index));
        this.selectedRows.clear();
        this.applyEdit(replaceAt(this.data, this.location, nextArray), origin);
    }

    selectedValues() {
        const current = this.requireCurrentArray();

        return sortedSelection(this.selectedRows, current.length).map((index) => current[index]);
    }

    async copySelectedRows(writeText: (text: string) => Promise<void>) {
        const selectedValues = this.selectedValues();
        if (selectedValues.length === 0) return;

        await writeText(JSON.stringify(selectedValues, null, 2));
    }

    async cutSelectedRows(writeText: (text: string) => Promise<void>, origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const selectedValues = this.selectedValues();
        if (selectedValues.length === 0) return;

        await writeText(JSON.stringify(selectedValues, null, 2));
        this.deleteSelectedRows(origin);
    }

    pasteRows(text: string, origin: OpenDocumentOrigin = null) {
        this.requireWritable();
        const current = this.requireCurrentArray();
        let values: unknown;
        try {
            values = JSON.parse(text);
        } catch (error) {
            throw new Error('Clipboard does not contain valid JSON', { cause: error });
        }
        if (!Array.isArray(values)) throw new Error('Clipboard JSON must be an array of rows');

        const insertIndex = this.selectedRows.size > 0 ? Math.max(...this.selectedRows) + 1 : current.length;
        const nextArray = [...current.slice(0, insertIndex), ...values as JsonValue[], ...current.slice(insertIndex)];
        this.selectedRows.clear();
        this.applyEdit(replaceAt(this.data, this.location, nextArray), origin);
    }

    replaceFromExternal(data: JsonValue) {
        if (this.dirty) throw new Error('Cannot replace a dirty JSON draft');
        this.data = data;
        this.location = existingLocation(data, this.location);
        this.numberInputs.clear();
        this.selectedRows.clear();
        this.externalConflict = false;
        this.publish('draft', null);
    }

    markExternalConflict() {
        if (this.externalConflict) return false;

        this.externalConflict = true;
        this.publish();

        return true;
    }

    invalidate(reason: string) {
        if (this.unavailableReason === reason) return;

        this.unavailableReason = reason;
        this.numberInputs.clear();
        this.selectedRows.clear();
        this.publish();
    }

    createSaveReference(): OpenDocumentSaveReference {
        const revision = this.editRevision;

        return { document: this, acknowledge: () => this.acknowledge(revision) } as OpenDocumentSaveReference;
    }

    serialize() {
        return `${JSON.stringify(this.data, null, 2)}\n`;
    }

    private applyEdit(data: JsonValue, origin: OpenDocumentOrigin) {
        const wasDirty = this.dirty;
        this.data = data;
        this.location = existingLocation(data, this.location);
        this.numberInputs.clear();
        this.editRevision += 1;
        this.publish('draft', origin);
        if (!wasDirty) this.dispatchDocumentChanged('dirty', origin);
    }

    private acknowledge(revision: number) {
        if (revision <= this.acknowledgedRevision) return;

        const wasDirty = this.dirty;
        this.acknowledgedRevision = revision;
        this.externalConflict = false;
        this.publish('saved', null);
        if (wasDirty && !this.dirty) this.dispatchDocumentChanged('dirty', null);
    }

    private requireCurrentArray() {
        const value = this.getValue();
        if (!Array.isArray(value)) throw new Error('Row operation requires a JSON array');

        return value;
    }

    private requireWritable() {
        if (this.unavailableReason) throw new Error(this.unavailableReason);
        if (this.readOnly) throw new Error(`JSON document is read-only: ${this.path}`);
    }

    private createSnapshot(): JsonDataDocumentSnapshot {
        return {
            data: this.data,
            dirty: this.dirty,
            externalConflict: this.externalConflict,
            location: this.location,
            numberInputs: new Map(this.numberInputs),
            selectedRows: [...this.selectedRows].sort((first, second) => first - second),
            unavailableReason: this.unavailableReason,
        };
    }

    private publish(type?: OpenDocumentChangedDetail['type'], origin: OpenDocumentOrigin = null) {
        this.snapshot = this.createSnapshot();
        this.dispatchEvent(new Event('changed'));
        if (type) this.dispatchDocumentChanged(type, origin);
    }

    private dispatchDocumentChanged(type: OpenDocumentChangedDetail['type'], origin: OpenDocumentOrigin) {
        const detail: OpenDocumentChangedDetail = { document: this, origin, type } as OpenDocumentChangedDetail;
        this.dispatchEvent(new CustomEvent<OpenDocumentChangedDetail>('documentChanged', { detail }));
    }
}
