import {
    parseDiagramData,
    type DiagramData,
    type DiagramEdge,
    type DiagramLegendEntryData,
    type DiagramNode,
} from './diagram_data';
import { DiagramEditContext } from './diagram_edit_context';
import {
    diagramFormattingCategoryChangedEvent,
    diagramLegendMembershipChangedEvent,
    diagramObjectFieldChangedEvent,
} from './diagram_edit_events';
import type {
    DiagramChange,
    DiagramFieldChangeDetail,
    DiagramLegendMembershipChangeDetail,
} from './diagram_edit_types';
import { invalidDiagramField } from './diagram_edit_validation';
import {
    edgeLegendEntryIsCompatible,
    nodeLegendEntryIsCompatible,
} from './diagram_legend_entry_compatibility';
import type {
    DiagramFormatPasteOptions,
    DiagramFormatSource,
} from './diagram_format_paste_service';
import type { DiagramSelectionIdentity } from './diagram_selection_service';

type FormatTarget = DiagramNodeFormatTarget | DiagramEdgeFormatTarget;

interface DiagramNodeFormatTarget {
    id: string;
    objectKind: 'node';
    values: Partial<Pick<DiagramNode, 'kind' | 'label' | 'legendEntryId' | 'role'>>;
}

interface DiagramEdgeFormatTarget {
    id: string;
    objectKind: 'edge';
    values: Partial<Pick<DiagramEdge, 'kind' | 'label' | 'legendEntryId'>>;
}

interface FormatPastePlan {
    importedLegendEntry: DiagramLegendEntryData | null;
    targets: readonly FormatTarget[];
}

function legendEntriesAreEquivalent(left: DiagramLegendEntryData, right: DiagramLegendEntryData) {
    if (left.label !== right.label) return false;
    if ('role' in left || 'role' in right) return 'role' in left && 'role' in right && left.role === right.role;
    if ('nodeKind' in left || 'nodeKind' in right) {
        return 'nodeKind' in left && 'nodeKind' in right && left.nodeKind === right.nodeKind;
    }

    return left.kind === right.kind && left.useLabelAsDefault === right.useLabelAsDefault;
}

function sourceLegendEntry(source: DiagramFormatSource) {
    return structuredClone(source.legendEntry) as DiagramLegendEntryData;
}

function equivalentLegendEntryId(source: DiagramFormatSource, entries: readonly DiagramLegendEntryData[]) {
    const sourceEntry = sourceLegendEntry(source);

    return entries.find((entry) => legendEntriesAreEquivalent(sourceEntry, entry))?.id ?? null;
}

function compatibleNodeLegendEntryId(node: DiagramNode, diagram: DiagramData) {
    const current = diagram.meta.legend.find(({ id }) => id === node.legendEntryId);
    if (current && nodeLegendEntryIsCompatible(current, node, diagram.meta.type)) return current.id;

    const compatible = diagram.meta.legend.find((entry) => (
        nodeLegendEntryIsCompatible(entry, node, diagram.meta.type)
    ));
    if (!compatible) invalidDiagramField('formatPaste.legendEntryId', 'no compatible target legend entry exists');

    return compatible.id;
}

function compatibleEdgeLegendEntryId(edge: DiagramEdge, diagram: DiagramData) {
    const current = diagram.meta.legend.find(({ id }) => id === edge.legendEntryId);
    if (current && edgeLegendEntryIsCompatible(current, edge)) return current.id;

    const compatible = diagram.meta.legend.find((entry) => edgeLegendEntryIsCompatible(entry, edge));
    if (!compatible) invalidDiagramField('formatPaste.legendEntryId', 'no compatible target legend entry exists');

    return compatible.id;
}

function prepareNodeTarget(
    source: Extract<DiagramFormatSource, { objectKind: 'node' }>,
    nodeId: string,
    options: DiagramFormatPasteOptions,
    candidate: DiagramData,
    targetLegendEntryId: string | null,
): DiagramNodeFormatTarget {
    const node = candidate.nodes.find(({ id }) => id === nodeId);
    if (!node) invalidDiagramField(`formatPaste.nodes.${nodeId}`, 'target does not exist');

    const values: DiagramNodeFormatTarget['values'] = {};
    if (options.legend) {
        const entry = candidate.meta.legend.find(({ id }) => id === targetLegendEntryId);
        if (!entry) invalidDiagramField('formatPaste.legend', 'target legend entry does not exist');
        values.legendEntryId = entry.id;
        if ('role' in entry) values.role = entry.role;
        if ('nodeKind' in entry) values.kind = entry.nodeKind;
    }
    if (options.kind) values.kind = source.kind;
    if (options.label) values.label = source.label;

    const nodeCandidate = { ...node, ...values };
    if (options.kind && !options.legend) {
        values.legendEntryId = compatibleNodeLegendEntryId(nodeCandidate, candidate);
    }
    Object.assign(node, values);

    return { id: nodeId, objectKind: 'node', values };
}

function prepareEdgeTarget(
    source: Extract<DiagramFormatSource, { objectKind: 'edge' }>,
    edgeId: string,
    options: DiagramFormatPasteOptions,
    candidate: DiagramData,
    targetLegendEntryId: string | null,
): DiagramEdgeFormatTarget {
    const edge = candidate.edges.find(({ id }) => id === edgeId);
    if (!edge) invalidDiagramField(`formatPaste.edges.${edgeId}`, 'target does not exist');

    const values: DiagramEdgeFormatTarget['values'] = {};
    if (options.legend) {
        const entry = candidate.meta.legend.find(({ id }) => id === targetLegendEntryId);
        if (!entry || !('kind' in entry)) {
            invalidDiagramField('formatPaste.legend', 'target connection legend entry does not exist');
        }
        values.kind = entry.kind;
        values.legendEntryId = entry.id;
    }
    if (options.kind) values.kind = source.kind;
    if (options.label) values.label = source.label;

    const edgeCandidate = { ...edge, ...values };
    if (options.kind && !options.legend) {
        values.legendEntryId = compatibleEdgeLegendEntryId(edgeCandidate, candidate);
    }
    Object.assign(edge, values);

    return { id: edgeId, objectKind: 'edge', values };
}

/** Applies one captured format source through one validated model transaction. */
export class DiagramFormatPasteEditor {
    private readonly context: DiagramEditContext;

    constructor(context: DiagramEditContext) { this.context = context; }

    apply(
        source: DiagramFormatSource,
        identities: readonly DiagramSelectionIdentity[],
        options: DiagramFormatPasteOptions,
    ) {
        const plan = this.context.validateOperationResult('Format Paste', () => (
            this.createValidatedPlan(source, identities, options)
        ));
        if (!plan) return false;

        this.applyPlan(source, plan);

        return true;
    }

    private createValidatedPlan(
        source: DiagramFormatSource,
        identities: readonly DiagramSelectionIdentity[],
        options: DiagramFormatPasteOptions,
    ): FormatPastePlan {
        if (!options.kind && !options.label && !options.legend) {
            invalidDiagramField('formatPaste.options', 'at least one option is required');
        }
        if (options.kind && source.kind === undefined) {
            invalidDiagramField('formatPaste.kind', 'source has no kind');
        }
        if (options.label && source.label === undefined) {
            invalidDiagramField('formatPaste.label', 'source has no label');
        }

        const diagram = this.context.diagram;
        const candidate = structuredClone(diagram);
        const compatibleIdentities = identities.filter(({ objectKind }) => objectKind === source.objectKind);
        if (compatibleIdentities.length === 0) {
            invalidDiagramField('formatPaste.selection', `has no selected ${source.objectKind} target`);
        }

        const importedLegendEntry = options.legend ? this.prepareLegendEntry(source, candidate) : null;
        const targetLegendEntryId = options.legend
            ? equivalentLegendEntryId(source, candidate.meta.legend)
            : null;
        const targets = compatibleIdentities.map(({ objectId }) => (
            source.objectKind === 'node'
                ? prepareNodeTarget(source, objectId, options, candidate, targetLegendEntryId)
                : prepareEdgeTarget(source, objectId, options, candidate, targetLegendEntryId)
        ));
        if (importedLegendEntry && source.legendFormatting) {
            candidate.formatting = {
                ...candidate.formatting,
                legendEntries: {
                    ...candidate.formatting?.legendEntries,
                    [importedLegendEntry.id]: structuredClone(source.legendFormatting),
                },
            };
        }
        parseDiagramData(JSON.stringify(candidate));

        return { importedLegendEntry, targets };
    }

    private prepareLegendEntry(source: DiagramFormatSource, candidate: DiagramData) {
        const equivalentId = equivalentLegendEntryId(source, candidate.meta.legend);
        if (equivalentId) return null;

        const entry = sourceLegendEntry(source);
        const existingIds = new Set(candidate.meta.legend.map(({ id }) => id));
        if (existingIds.has(entry.id)) {
            entry.id = this.context.generateObjectId((id) => existingIds.has(id));
        }
        candidate.meta.legend.push(entry);

        return entry;
    }

    private applyPlan(source: DiagramFormatSource, plan: FormatPastePlan) {
        const diagram = this.context.diagram;
        const fieldEvents: Array<{ detail: DiagramFieldChangeDetail, eventName: string }> = [];
        const importedEntry = plan.importedLegendEntry;
        if (importedEntry) {
            diagram.meta.legend.push(structuredClone(importedEntry));
            this.context.setLegendEntryKeys(Object.freeze(diagram.meta.legend.map(({ id }) => id)));
            this.context.changeRegistry.markLegendPresence();
            this.context.changeRegistry.markLegendMembership(importedEntry.id);
            this.context.changeRegistry.markLegendOrderChanges();
            if (source.legendFormatting) {
                diagram.formatting = {
                    ...diagram.formatting,
                    legendEntries: {
                        ...diagram.formatting?.legendEntries,
                        [importedEntry.id]: structuredClone(source.legendFormatting),
                    },
                };
                const eventName = diagramFormattingCategoryChangedEvent('legendEntry', importedEntry.id);
                const change: DiagramChange = {
                    category: 'field',
                    field: 'legendEntry',
                    id: eventName,
                    objectId: importedEntry.id,
                    objectKind: 'formatting',
                    originalValue: undefined,
                    ownerId: null,
                    regionIndex: null,
                    value: structuredClone(source.legendFormatting),
                };
                this.context.changeRegistry.set(change, `formatting:${importedEntry.id}:legendEntry`, false);
            }
        }

        for (const target of plan.targets) {
            const object = target.objectKind === 'node'
                ? this.context.getNode(target.id)
                : this.context.getEdge(target.id);
            const original = target.objectKind === 'node'
                ? this.context.changeRegistry.originalNodes.get(target.id)
                : this.context.changeRegistry.originalEdges.get(target.id);
            for (const [field, value] of Object.entries(target.values)) {
                const writableObject = object as unknown as Record<string, unknown>;
                const previousValue = writableObject[field];
                if (Object.is(previousValue, value)) continue;

                writableObject[field] = value;
                const eventName = diagramObjectFieldChangedEvent(target.objectKind, target.id, field);
                const originalValue = (original as unknown as Record<string, unknown> | undefined)?.[field];
                const change: DiagramChange = {
                    category: 'field', field, id: eventName, objectId: target.id, objectKind: target.objectKind,
                    originalValue, ownerId: null, regionIndex: null, value,
                };
                this.context.changeRegistry.set(
                    change,
                    `${target.objectKind}:${target.id}`,
                    Object.is(originalValue, value),
                );
                fieldEvents.push({
                    detail: { field, objectId: target.id, objectKind: target.objectKind, previousValue, value },
                    eventName,
                });
            }
        }

        if (!importedEntry && fieldEvents.length === 0) return;

        this.context.transaction.commit([]);
        if (importedEntry) {
            const membershipDetail: DiagramLegendMembershipChangeDetail = {
                addedKeys: [importedEntry.id],
                removedKeys: [],
            };
            this.context.target.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
                diagramLegendMembershipChangedEvent(),
                { detail: membershipDetail },
            ));
            if (source.legendFormatting) {
                const formattingDetail: DiagramFieldChangeDetail = {
                    field: 'legendEntry',
                    objectId: importedEntry.id,
                    objectKind: 'formatting',
                    previousValue: undefined,
                    value: source.legendFormatting,
                };
                this.context.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(
                    diagramFormattingCategoryChangedEvent('legendEntry', importedEntry.id),
                    { detail: formattingDetail },
                ));
            }
        }
        for (const { detail, eventName } of fieldEvents) {
            this.context.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }));
        }
    }
}
