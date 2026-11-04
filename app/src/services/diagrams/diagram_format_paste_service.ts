import type {
    DiagramEdgeKind,
    DiagramLegendEntryData,
    DiagramLegendEntryFormatting,
    DiagramNodeKind,
    DiagramRole,
} from './diagram_data';
import type { DiagramEditSessionAccess, DiagramEditSessionService } from './diagram_edit_session_service';
import type { DeepReadonly } from './diagram_edit_types';
import type { DiagramSelectionIdentity } from './diagram_selection_service';

const SOURCE_CHANGED_EVENT = 'sourceChanged';
const DIALOG_OPEN_CHANGED_EVENT = 'dialogOpenChanged';
const DIALOG_OPTIONS_CHANGED_EVENT = 'dialogOptionsChanged';

type DiagramFormatSourceReader = DiagramEditSessionAccess<
    'getEdgeSnapshot' | 'getEditableDiagram' | 'getNodeSnapshot',
    never
>;

interface DiagramFormatSourceBase {
    label?: string;
    legendEntry: DeepReadonly<DiagramLegendEntryData>;
    legendEntryId: string;
    legendFormatting?: DeepReadonly<DiagramLegendEntryFormatting>;
}

export interface DiagramNodeFormatSource extends DiagramFormatSourceBase {
    kind?: DiagramNodeKind;
    objectKind: 'node';
    role: DiagramRole;
}

export interface DiagramEdgeFormatSource extends DiagramFormatSourceBase {
    kind: DiagramEdgeKind;
    objectKind: 'edge';
}

export type DiagramFormatSource = DiagramNodeFormatSource | DiagramEdgeFormatSource;

export interface DiagramFormatPasteOptions {
    kind: boolean;
    label: boolean;
    legend: boolean;
}

function immutableLegendEntry(entry: DeepReadonly<DiagramLegendEntryData>) {
    return Object.freeze(structuredClone(entry)) as DeepReadonly<DiagramLegendEntryData>;
}

function immutableLegendFormatting(formatting: DeepReadonly<DiagramLegendEntryFormatting> | undefined) {
    if (!formatting) return undefined;

    const snapshot = structuredClone(formatting);
    if ('box' in snapshot && snapshot.box) Object.freeze(snapshot.box);
    if (snapshot.font) Object.freeze(snapshot.font);
    if ('line' in snapshot && snapshot.line) Object.freeze(snapshot.line);

    return Object.freeze(snapshot) as DeepReadonly<DiagramLegendEntryFormatting>;
}

/** Owns immutable Copy source and Format Paste dialog state across diagram navigation. */
export class DiagramFormatPasteService extends EventTarget {
    private dialogOpen = false;
    private dialogOptions: DiagramFormatPasteOptions = Object.freeze({ kind: false, label: false, legend: true });
    private source: DiagramFormatSource | null = null;

    getSourceSnapshot = () => this.source;

    getDialogOpenSnapshot = () => this.dialogOpen;

    getDialogOptionsSnapshot = () => this.dialogOptions;

    subscribeSource = (listener: () => void) => this.subscribe(SOURCE_CHANGED_EVENT, listener);

    subscribeDialogOpen = (listener: () => void) => this.subscribe(DIALOG_OPEN_CHANGED_EVENT, listener);

    subscribeDialogOptions = (listener: () => void) => this.subscribe(DIALOG_OPTIONS_CHANGED_EVENT, listener);

    captureSuccessfulCopy(identities: readonly DiagramSelectionIdentity[], reader: DiagramFormatSourceReader) {
        if (identities.length !== 1) {
            this.clearSource();

            return false;
        }

        const [identity] = identities;
        if (identity.objectKind === 'group') {
            this.clearSource();

            return false;
        }

        const diagram = reader.read.getEditableDiagram();
        if (!diagram) return false;

        if (identity.objectKind === 'node') {
            const node = reader.read.getNodeSnapshot(identity.objectId);
            if (!node) return false;
            const legendEntry = diagram.meta.legend.find(({ id }) => id === node.legendEntryId);
            if (!legendEntry) return false;

            this.source = Object.freeze({
                kind: node.kind,
                label: node.label,
                legendEntry: immutableLegendEntry(legendEntry),
                legendEntryId: node.legendEntryId,
                legendFormatting: immutableLegendFormatting(diagram.formatting?.legendEntries?.[node.legendEntryId]),
                objectKind: 'node',
                role: node.role,
            });
        } else {
            const edge = reader.read.getEdgeSnapshot(identity.objectId);
            if (!edge) return false;
            const legendEntry = diagram.meta.legend.find(({ id }) => id === edge.legendEntryId);
            if (!legendEntry) return false;

            this.source = Object.freeze({
                kind: edge.kind,
                label: edge.label,
                legendEntry: immutableLegendEntry(legendEntry),
                legendEntryId: edge.legendEntryId,
                legendFormatting: immutableLegendFormatting(diagram.formatting?.legendEntries?.[edge.legendEntryId]),
                objectKind: 'edge',
            });
        }
        this.dispatchEvent(new Event(SOURCE_CHANGED_EVENT));

        return true;
    }

    clearSource() {
        if (!this.source) return false;

        this.source = null;
        this.dispatchEvent(new Event(SOURCE_CHANGED_EVENT));

        return true;
    }

    openDialog() {
        if (!this.source || this.dialogOpen) return false;

        this.dialogOptions = Object.freeze({
            kind: this.source.kind !== undefined,
            label: this.source.label !== undefined,
            legend: true,
        });
        this.dialogOpen = true;
        this.dispatchEvent(new Event(DIALOG_OPTIONS_CHANGED_EVENT));
        this.dispatchEvent(new Event(DIALOG_OPEN_CHANGED_EVENT));

        return true;
    }

    closeDialog() {
        if (!this.dialogOpen) return false;

        this.dialogOpen = false;
        this.dispatchEvent(new Event(DIALOG_OPEN_CHANGED_EVENT));

        return true;
    }

    setDialogOption(option: keyof DiagramFormatPasteOptions, checked: boolean) {
        if (this.dialogOptions[option] === checked) return false;

        this.dialogOptions = Object.freeze({ ...this.dialogOptions, [option]: checked });
        this.dispatchEvent(new Event(DIALOG_OPTIONS_CHANGED_EVENT));

        return true;
    }

    apply(
        identities: readonly DiagramSelectionIdentity[],
        options: DiagramFormatPasteOptions,
        session: DiagramEditSessionService,
    ) {
        if (!this.source) return false;

        return session.formatPaste.apply(this.source, identities, options);
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener);

        return () => this.removeEventListener(eventType, listener);
    }
}

export const diagramFormatPasteService = new DiagramFormatPasteService();
