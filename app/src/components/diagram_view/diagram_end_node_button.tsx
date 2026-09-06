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

// Both sizes mirror the preset defaults `diagram_layout` applies to end nodes without explicit geometry.
const FLOWCHART_END_SIZE = { height: 48, width: 120 };
const STATE_END_SIZE = { height: 24, width: 24 };

function endNodeDefinition(flowPreset: DiagramFlowPreset | null): DiagramNodePlacementDefinition {
    const { height, width } = flowPreset === 'state' ? STATE_END_SIZE : FLOWCHART_END_SIZE;

    return { defaults: { height, label: 'End', role: 'focal', width }, kind: 'end' };
}

export type DiagramEndNodeMetadataField = 'preset' | 'type';

export interface DiagramEndNodeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: {
        (field: 'preset'): DiagramFlowPreset | null;
        (field: 'type'): DiagramType | null;
    };
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: DiagramEndNodeMetadataField, listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramEndNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramEndNodeButtonProps {
    placement?: DiagramEndNodePlacement;
    session?: DiagramEndNodeSession;
}

function useFlowPreset(session: DiagramEndNodeSession) {
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

/** Activates end placement for both flow presets; the preset only picks the default geometry. */
export function DiagramEndNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramEndNodeButtonProps) {
    const flowPreset = useFlowPreset(session);
    const activeTool = useActiveDiagramTool(session, 'node:end');
    const handleActivate = useCallback(() => {
        placement.activate(endNodeDefinition(session.getMetadataFieldSnapshot('preset')));
    }, [placement, session]);

    if (flowPreset === undefined) return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="End"
            onActivate={handleActivate}
            tooltip="Place end node"
        />
    );
}
