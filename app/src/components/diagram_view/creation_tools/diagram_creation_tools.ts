import type {
    DiagramEdgeKind,
    DiagramFlowPreset,
    DiagramRole,
    DiagramType,
} from '../../../services/diagrams/diagram_data';
import type { DiagramCreationTool } from '../../../services/diagrams/diagram_edit_types';
import type { DiagramNodePlacementDefinition } from '../../../services/diagrams/diagram_node_placement_service';
import { MINDMAP_ROOT_DIAMETER, MINDMAP_TOPIC_DIAMETER } from '../../../services/diagrams/diagram_layout';

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
const MINDMAP_TOPIC_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: MINDMAP_TOPIC_DIAMETER, label: 'New topic', role: 'backend', width: MINDMAP_TOPIC_DIAMETER },
    kind: 'topic',
};
const FLOWCHART_TERMINAL_SIZE = { height: 48, width: 120 };
const STATE_TERMINAL_SIZE = { height: 24, width: 24 };

function terminalDefinition(kind: 'end' | 'start', preset: DiagramFlowPreset): DiagramNodePlacementDefinition {
    const { height, width } = preset === 'state' ? STATE_TERMINAL_SIZE : FLOWCHART_TERMINAL_SIZE;
    const label = kind === 'start' ? 'Start' : 'End';

    return { defaults: { height, label, role: 'focal', width }, kind };
}

function nodeTool(label: string, definition: DiagramNodePlacementDefinition): DiagramCreationToolDefinition {
    return { category: 'node', definition, label, role: definition.defaults.role, tool: `node:${definition.kind}` };
}

function edgeTool(label: string, edgeKind: DiagramEdgeKind): DiagramCreationToolDefinition {
    return { category: 'edge', edgeKind, label, tool: `edge:${edgeKind}` };
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
            nodeTool('Component', COMPONENT_DEFINITION),
            edgeTool('Connection', 'connection'),
            edgeTool('Data', 'data'),
            edgeTool('Async', 'async'),
            ...common,
        ];
    }
    if (type === 'dependency') {
        return [
            nodeTool('Component', COMPONENT_DEFINITION),
            edgeTool('Dependency', 'dependency'),
            edgeTool('Cycle', 'cycle'),
            ...common,
        ];
    }
    if (type === 'entity') {
        return [nodeTool('Entity', ENTITY_DEFINITION), edgeTool('Relationship', 'relationship'), ...common];
    }
    if (type === 'sequence') {
        return [
            nodeTool('Participant', PARTICIPANT_DEFINITION),
            edgeTool('Call', 'call'),
            edgeTool('Return', 'return'),
            edgeTool('Async', 'async'),
            edgeTool('Success', 'success'),
            ...common,
            { category: 'fragment', label: 'Fragment', tool: 'fragment' },
        ];
    }
    if (type === 'mindmap') {
        return hasMindmapRoot
            ? [nodeTool('Topic', MINDMAP_TOPIC_DEFINITION), edgeTool('Connection', 'connection'), ...common]
            : [nodeTool('Root', MINDMAP_ROOT_DEFINITION), ...common];
    }
    if (!preset) throw new Error('Flow diagram creation tools require a preset');

    const terminalTools = [
        nodeTool('Start', terminalDefinition('start', preset)),
        nodeTool('End', terminalDefinition('end', preset)),
    ];
    if (preset === 'state') {
        return [...terminalTools, nodeTool('State', STATE_DEFINITION), edgeTool('Transition', 'transition'), ...common];
    }

    return [
        ...terminalTools,
        nodeTool('Step', STEP_DEFINITION),
        nodeTool('Decision', DECISION_DEFINITION),
        edgeTool('Flow', 'flow'),
        ...common,
    ];
}
