import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import {
    diagramEditSessionService,
    type DiagramPersistentTool,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramNodePlacementService,
    type DiagramNodePlacementDefinition,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

// Both sizes mirror the preset defaults `diagram_layout` applies to start nodes without explicit geometry.
const FLOWCHART_START_SIZE = { height: 48, width: 120 };
const STATE_START_SIZE = { height: 24, width: 24 };

function startNodeDefinition(flowPreset: DiagramFlowPreset | null): DiagramNodePlacementDefinition {
    const { height, width } = flowPreset === 'state' ? STATE_START_SIZE : FLOWCHART_START_SIZE;

    return { defaults: { height, label: 'Start', role: 'focal', width }, kind: 'start' };
}

export type DiagramStartNodeMetadataField = 'preset' | 'type';

export interface DiagramStartNodeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: {
        (field: 'preset'): DiagramFlowPreset | null;
        (field: 'type'): DiagramType | null;
    };
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: DiagramStartNodeMetadataField, listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramStartNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramStartNodeButtonProps {
    placement?: DiagramStartNodePlacement;
    session?: DiagramStartNodeSession;
}

function useFlowPreset(session: DiagramStartNodeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribePreset = session.subscribeMetadataField('preset', listener);
        const unsubscribeType = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribePreset();
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(
        () => (session.getMetadataFieldSnapshot('type') === 'flow' ? session.getMetadataFieldSnapshot('preset') : undefined),
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates start placement for both flow presets; the preset only picks the default geometry. */
export function DiagramStartNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramStartNodeButtonProps) {
    const flowPreset = useFlowPreset(session);
    const activeTool = useActiveDiagramTool(session, 'node:start');
    const handleActivate = useCallback(() => {
        placement.activate(startNodeDefinition(session.getMetadataFieldSnapshot('preset')));
    }, [placement, session]);

    if (flowPreset === undefined) return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="Start"
            onActivate={handleActivate}
            tooltip="Place start node"
        />
    );
}
