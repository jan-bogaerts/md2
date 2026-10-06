import type {
    DiagramEdgeKind,
    DiagramFlowPreset,
    DiagramRole,
    DiagramType,
} from '../../../services/diagrams/diagram_data';
import type { DiagramCreationTool } from '../../../services/diagrams/diagram_edit_types';
import { MINDMAP_TOPIC_PLACEMENT, type DiagramNodePlacementDefinition } from '../../../services/diagrams/diagram_node_placement_service';
import { MINDMAP_ROOT_DIAMETER } from '../../../services/diagrams/diagram_layout';
import { diagramEdgeKindLabel, diagramNodeKindLabel } from '../../../services/diagrams/diagram_creation_tool_labels';

export type DiagramCreationToolDefinition =
    | { category: 'edge', edgeKind: DiagramEdgeKind, label: string, tool: DiagramCreationTool }
    | { category: 'fragment', label: string, tool: 'fragment' }
    | { category: 'group', label: string, tool: 'group' }
    | { category: 'node', definition: DiagramNodePlacementDefinition, label: string, role: DiagramRole, tool: DiagramCreationTool };

const COMPONENT_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
    kind: 'component',
};
const ENTITY_PREVIEW_SIZE = { height: 48, width: 160 };
const ENTITY_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { fields: [], label: 'New entity', role: 'focal', width: ENTITY_PREVIEW_SIZE.width },
    kind: 'entity',
    previewSize: ENTITY_PREVIEW_SIZE,
};
const PARTICIPANT_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New participant', role: 'focal', width: 160 },
    kind: 'participant',
};
const STEP_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New step', role: 'focal', width: 160 },
    kind: 'step',
};
const DECISION_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 96, label: 'New decision', role: 'focal', width: 96 },
    kind: 'decision',
};
const STATE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New state', role: 'focal', width: 160 },
    kind: 'state',
};
const MINDMAP_ROOT_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: MINDMAP_ROOT_DIAMETER, label: 'New root', role: 'focal', width: MINDMAP_ROOT_DIAMETER },
    kind: 'root',
};
const FLOWCHART_TERMINAL_SIZE = { height: 48, width: 120 };
const STATE_TERMINAL_SIZE = { height: 24, width: 24 };

function terminalDefinition(kind: 'end' | 'start', preset: DiagramFlowPreset): DiagramNodePlacementDefinition {
    const { height, width } = preset === 'state' ? STATE_TERMINAL_SIZE : FLOWCHART_TERMINAL_SIZE;
    const label = kind === 'start' ? 'Start' : 'End';

    return { defaults: { height, label, role: 'focal', width }, kind };
}

function nodeTool(definition: DiagramNodePlacementDefinition): DiagramCreationToolDefinition {
    return { category: 'node', definition, label: diagramNodeKindLabel(definition.kind), role: definition.defaults.role, tool: `node:${definition.kind}` };
}

function edgeTool(edgeKind: DiagramEdgeKind): DiagramCreationToolDefinition {
    return { category: 'edge', edgeKind, label: diagramEdgeKindLabel(edgeKind), tool: `edge:${edgeKind}` };
}

/** Returns creation tools permitted by active diagram schema, in menu order. */
export function diagramCreationTools(
    type: DiagramType,
    preset: DiagramFlowPreset | null,
    hasMindmapRoot = false,
): readonly DiagramCreationToolDefinition[] {
    const common: DiagramCreationToolDefinition[] = [{ category: 'group', label: 'Group', tool: 'group' }];
    if (type === 'architecture') {
        return [
            nodeTool(COMPONENT_DEFINITION),
            edgeTool('connection'),
            edgeTool('data'),
            edgeTool('async'),
            ...common,
        ];
    }
    if (type === 'dependency') {
        return [
            nodeTool(COMPONENT_DEFINITION),
            edgeTool('dependency'),
            edgeTool('cycle'),
            ...common,
        ];
    }
    if (type === 'entity') {
        return [nodeTool(ENTITY_DEFINITION), edgeTool('relationship'), ...common];
    }
    if (type === 'sequence') {
        return [
            nodeTool(PARTICIPANT_DEFINITION),
            edgeTool('call'),
            edgeTool('return'),
            edgeTool('async'),
            edgeTool('success'),
            ...common,
            { category: 'fragment', label: 'Fragment', tool: 'fragment' },
        ];
    }
    if (type === 'mindmap') {
        return hasMindmapRoot
            ? [nodeTool(MINDMAP_TOPIC_PLACEMENT), edgeTool('connection'), ...common]
            : [nodeTool(MINDMAP_ROOT_DEFINITION), ...common];
    }
    if (!preset) throw new Error('Flow diagram creation tools require a preset');

    const terminalTools = [
        nodeTool(terminalDefinition('start', preset)),
        nodeTool(terminalDefinition('end', preset)),
    ];
    if (preset === 'state') {
        return [...terminalTools, nodeTool(STATE_DEFINITION), edgeTool('transition'), ...common];
    }

    return [
        ...terminalTools,
        nodeTool(STEP_DEFINITION),
        nodeTool(DECISION_DEFINITION),
        edgeTool('flow'),
        ...common,
    ];
}
