import { describe, expect, it, vi } from 'vitest';
import type { DiagramData } from './diagram_data';
import { DiagramEditSessionService } from './diagram_edit_session_service';
import type { DiagramFormatSource } from './diagram_format_paste_service';
import type { DiagramViewSourceSnapshot } from './diagram_view_service';

const project = { branch: 'main', id: 'project', rootPath: 'C:/project' };

function architectureDiagram(): DiagramData {
    return {
        edges: [{
            from: 'source', id: 'source-target', kind: 'connection', label: 'Old edge',
            legendEntryId: 'connection-entry', to: 'target',
        }],
        formatting: {legendEntries: {'backend-entry': { box: { fillColor: '#00ff00' } }}},
        groups: [{ id: 'group', label: 'Group', nodeIds: ['source', 'target'] }],
        meta: {
            description: 'Format target',
            legend: [
                { id: 'focal-entry', label: 'Service', role: 'focal' },
                { id: 'backend-entry', label: 'Backend', role: 'backend' },
                { id: 'connection-entry', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
            ],
            title: 'Format target',
            type: 'architecture',
            version: 3,
        },
        nodes: [
            { id: 'source', kind: 'component', label: 'Source', legendEntryId: 'focal-entry', role: 'focal' },
            { id: 'target', kind: 'component', label: 'Target', legendEntryId: 'backend-entry', role: 'backend' },
        ],
    };
}

function mindmapDiagram(): DiagramData {
    return {
        edges: [
            { from: 'root', id: 'root-one', kind: 'connection', legendEntryId: 'connection-entry', to: 'one' },
            { from: 'root', id: 'root-two', kind: 'connection', legendEntryId: 'connection-entry', to: 'two' },
        ],
        groups: [],
        meta: {
            description: 'Mindmap target',
            legend: [
                { id: 'root-entry', label: 'Root', nodeKind: 'root' },
                { id: 'topic-entry', label: 'Topic', nodeKind: 'topic' },
                { id: 'connection-entry', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
            ],
            title: 'Mindmap target',
            type: 'mindmap',
            version: 3,
        },
        nodes: [
            { id: 'root', kind: 'root', label: 'Root', legendEntryId: 'root-entry', role: 'focal' },
            { id: 'one', kind: 'topic', label: 'One', legendEntryId: 'topic-entry', role: 'backend' },
            { id: 'two', kind: 'topic', label: 'Two', legendEntryId: 'topic-entry', role: 'backend' },
        ],
    };
}

class SourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot;

    constructor(diagram: DiagramData) {
        super();
        this.source = {
            diagram,
            record: { actionId: 'action', id: 'diagram', label: 'Diagram', path: 'diagram.json' },
        };
    }

    getSourceSnapshot = () => this.source;

    subscribeSource = (listener: () => void) => {
        this.addEventListener('source', listener);

        return () => this.removeEventListener('source', listener);
    };
}

function createSession(
    diagram: DiagramData,
    createId: () => string = () => 'generated-entry',
    reportValidationError = vi.fn(),
) {
    const session = new DiagramEditSessionService(new SourceStub(diagram), createId, reportValidationError);
    session.bindProject(project);
    session.start();

    return { reportValidationError, session };
}

function nodeSource(overrides: Partial<Extract<DiagramFormatSource, { objectKind: 'node' }>> = {}) {
    return {
        kind: 'component',
        label: 'Copied label',
        legendEntry: { id: 'copied-entry', label: 'External', role: 'external' },
        legendEntryId: 'copied-entry',
        objectKind: 'node',
        role: 'external',
        ...overrides,
    } as Extract<DiagramFormatSource, { objectKind: 'node' }>;
}

describe('DiagramFormatPasteEditor', () => {
    it('applies exact labels to matching targets only and keeps repeated Apply available', () => {
        const { session } = createSession(architectureDiagram());
        const nodeLabelChanged = vi.fn();
        const edgeLabelChanged = vi.fn();
        const modelMutation = vi.fn();
        session.read.subscribeNodeField('target', 'label', nodeLabelChanged);
        session.read.subscribeEdgeField('source-target', 'label', edgeLabelChanged);
        session.read.subscribeModelMutation(modelMutation);
        const selection = [
            { objectId: 'target', objectKind: 'node' as const },
            { objectId: 'source-target', objectKind: 'edge' as const },
            { objectId: 'group', objectKind: 'group' as const },
        ];

        expect(session.formatPaste.apply(nodeSource(), selection, { kind: false, label: true, legend: false })).toBe(true);
        expect(session.read.getNodeFieldSnapshot('target', 'label')).toBe('Copied label');
        expect(session.read.getEdgeFieldSnapshot('source-target', 'label')).toBe('Old edge');
        expect(nodeLabelChanged).toHaveBeenCalledOnce();
        expect(edgeLabelChanged).not.toHaveBeenCalled();
        expect(modelMutation).toHaveBeenCalledOnce();

        expect(session.formatPaste.apply(nodeSource(), selection, { kind: false, label: true, legend: false })).toBe(true);
        expect(modelMutation).toHaveBeenCalledOnce();
    });

    it('imports a colliding legend ID, its formatting, and required classification in one batch', () => {
        const { session } = createSession(architectureDiagram());
        const legendMembership = vi.fn();
        const roleChanged = vi.fn();
        const legendReferenceChanged = vi.fn();
        const modelMutation = vi.fn();
        session.read.subscribeLegendMembership(legendMembership);
        session.read.subscribeNodeField('target', 'role', roleChanged);
        session.read.subscribeNodeField('target', 'legendEntryId', legendReferenceChanged);
        session.read.subscribeModelMutation(modelMutation);
        const source = nodeSource({
            legendEntry: { id: 'focal-entry', label: 'External', role: 'external' },
            legendEntryId: 'focal-entry',
            legendFormatting: { box: { fillColor: '#123456' }, font: { bold: true } },
        });

        expect(session.formatPaste.apply(
            source,
            [{ objectId: 'target', objectKind: 'node' }],
            { kind: false, label: false, legend: true },
        )).toBe(true);

        expect(session.read.getNodeSnapshot('target')).toMatchObject({kind: 'component', label: 'Target', legendEntryId: 'generated-entry', role: 'external'});
        expect(session.read.getLegendEntryFieldSnapshot('generated-entry', 'label')).toBe('External');
        expect(session.read.getFormattingSnapshot()?.legendEntries?.['generated-entry']).toEqual({box: { fillColor: '#123456' }, font: { bold: true }});
        expect(legendMembership).toHaveBeenCalledOnce();
        expect(roleChanged).toHaveBeenCalledOnce();
        expect(legendReferenceChanged).toHaveBeenCalledOnce();
        expect(modelMutation).toHaveBeenCalledOnce();
    });

    it('applies a connection source to selected connections only', () => {
        const { session } = createSession(architectureDiagram());
        const source: Extract<DiagramFormatSource, { objectKind: 'edge' }> = {
            kind: 'connection',
            label: 'Copied edge label',
            legendEntry: { id: 'connection-entry', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
            legendEntryId: 'connection-entry',
            objectKind: 'edge',
        };

        expect(session.formatPaste.apply(
            source,
            [
                { objectId: 'source-target', objectKind: 'edge' },
                { objectId: 'target', objectKind: 'node' },
            ],
            { kind: false, label: true, legend: false },
        )).toBe(true);

        expect(session.read.getEdgeFieldSnapshot('source-target', 'label')).toBe('Copied edge label');
        expect(session.read.getNodeFieldSnapshot('target', 'label')).toBe('Target');
    });

    it('reuses an equivalent legend entry and preserves target formatting', () => {
        const diagram = architectureDiagram();
        diagram.meta.legend.push({ id: 'target-external', label: 'External', role: 'external' });
        diagram.formatting = {
            ...diagram.formatting,
            legendEntries: {
                ...diagram.formatting?.legendEntries,
                'target-external': { box: { fillColor: '#abcdef' } },
            },
        };
        const { session } = createSession(diagram);

        expect(session.formatPaste.apply(
            nodeSource({ legendFormatting: { box: { fillColor: '#123456' } } }),
            [{ objectId: 'target', objectKind: 'node' }],
            { kind: false, label: false, legend: true },
        )).toBe(true);

        expect(session.read.getNodeFieldSnapshot('target', 'legendEntryId')).toBe('target-external');
        expect(session.read.getFormattingSnapshot()?.legendEntries?.['target-external']).toEqual({box: { fillColor: '#abcdef' }});
        expect(session.read.getLegendEntryKeysSnapshot()).not.toContain('copied-entry');
    });

    it('rejects Kind when target has no compatible legend and leaves all edit state unchanged', () => {
        const { reportValidationError, session } = createSession(architectureDiagram());
        const before = JSON.stringify(session.read.getEditableDiagram());
        const source: Extract<DiagramFormatSource, { objectKind: 'edge' }> = {
            kind: 'data',
            legendEntry: { id: 'data-entry', kind: 'data', label: 'Data', useLabelAsDefault: false },
            legendEntryId: 'data-entry',
            objectKind: 'edge',
        };

        expect(session.formatPaste.apply(
            source,
            [{ objectId: 'source-target', objectKind: 'edge' }],
            { kind: true, label: false, legend: false },
        )).toBe(false);

        expect(JSON.stringify(session.read.getEditableDiagram())).toBe(before);
        expect(session.read.getDirtySnapshot()).toBe(false);
        expect(session.read.getChangeIdsSnapshot()).toEqual([]);
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('no compatible target legend entry exists'));
    });

    it('rolls back every target when cross-diagram validation rejects the complete batch', () => {
        const { reportValidationError, session } = createSession(mindmapDiagram());
        const before = JSON.stringify(session.read.getEditableDiagram());
        const source = nodeSource({
            kind: 'root',
            legendEntry: { id: 'root-source', label: 'Root', nodeKind: 'root' },
            legendEntryId: 'root-source',
            role: 'focal',
        });

        expect(session.formatPaste.apply(
            source,
            [
                { objectId: 'one', objectKind: 'node' },
                { objectId: 'two', objectKind: 'node' },
            ],
            { kind: false, label: false, legend: true },
        )).toBe(false);

        expect(JSON.stringify(session.read.getEditableDiagram())).toBe(before);
        expect(session.read.getDirtySnapshot()).toBe(false);
        expect(session.read.getChangeIdsSnapshot()).toEqual([]);
        expect(reportValidationError).toHaveBeenCalledOnce();
    });
});
