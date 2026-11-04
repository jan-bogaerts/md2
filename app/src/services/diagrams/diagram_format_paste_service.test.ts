import { describe, expect, it, vi } from 'vitest';
import type { DiagramData } from './diagram_data';
import { DiagramFormatPasteService } from './diagram_format_paste_service';

const diagram: DiagramData = {
    edges: [{
        from: 'source',
        id: 'source-target',
        kind: 'connection',
        label: 'Calls',
        legendEntryId: 'connection-entry',
        to: 'target',
    }],
    formatting: {legendEntries: {'source-entry': { box: { fillColor: '#123456' }, font: { bold: true } }}},
    groups: [],
    meta: {
        description: 'Format source',
        legend: [
            { id: 'source-entry', label: 'Service', role: 'focal' },
            { id: 'target-entry', label: 'Backend', role: 'backend' },
            { id: 'connection-entry', kind: 'connection', label: 'Calls', useLabelAsDefault: false },
        ],
        title: 'Format source',
        type: 'architecture',
        version: 3,
    },
    nodes: [
        { id: 'source', kind: 'component', label: 'Source', legendEntryId: 'source-entry', role: 'focal' },
        { id: 'target', kind: 'component', label: 'Target', legendEntryId: 'target-entry', role: 'backend' },
    ],
};

function reader() {
    return {
        read: {
            getEdgeSnapshot: (id: string) => diagram.edges.find((edge) => edge.id === id) ?? null,
            getEditableDiagram: () => diagram,
            getNodeSnapshot: (id: string) => diagram.nodes.find((node) => node.id === id) ?? null,
        },
    };
}

describe('DiagramFormatPasteService', () => {
    it('captures an immutable node snapshot and clears it after successful multi-object Copy', () => {
        const service = new DiagramFormatPasteService();
        const changed = vi.fn();
        service.subscribeSource(changed);

        expect(service.captureSuccessfulCopy([{ objectId: 'source', objectKind: 'node' }], reader())).toBe(true);
        const source = service.getSourceSnapshot();
        expect(source).toMatchObject({ label: 'Source', legendEntryId: 'source-entry', objectKind: 'node' });
        diagram.nodes[0].label = 'Changed later';
        diagram.meta.legend[0].label = 'Changed legend';
        const sourceFormatting = diagram.formatting?.legendEntries?.['source-entry'];
        if (sourceFormatting) sourceFormatting.font = { italic: true };
        expect(source).toMatchObject({
            label: 'Source',
            legendEntry: { label: 'Service' },
            legendFormatting: { box: { fillColor: '#123456' }, font: { bold: true } },
        });

        expect(service.captureSuccessfulCopy([
            { objectId: 'source', objectKind: 'node' },
            { objectId: 'target', objectKind: 'node' },
        ], reader())).toBe(false);
        expect(service.getSourceSnapshot()).toBeNull();
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it('captures a connection and owns observable dialog state', () => {
        const service = new DiagramFormatPasteService();
        const dialogChanged = vi.fn();
        service.subscribeDialogOpen(dialogChanged);

        expect(service.captureSuccessfulCopy([{ objectId: 'source-target', objectKind: 'edge' }], reader())).toBe(true);
        expect(service.getSourceSnapshot()).toMatchObject({ kind: 'connection', label: 'Calls', objectKind: 'edge' });
        expect(service.openDialog()).toBe(true);
        expect(service.getDialogOpenSnapshot()).toBe(true);
        expect(service.closeDialog()).toBe(true);
        expect(service.getDialogOpenSnapshot()).toBe(false);
        expect(dialogChanged).toHaveBeenCalledTimes(2);
    });
});
