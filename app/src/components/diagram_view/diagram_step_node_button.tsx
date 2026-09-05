import { useCallback, useSyncExternalStore } from 'react';
import {
    diagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramNodePlacementService,
    type DiagramNodePlacementDefinition,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import type { DiagramComponentNodeSession } from './diagram_component_node_button';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

const STEP_NODE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New step', role: 'focal', width: 160 },
    kind: 'step',
};

export type DiagramStepNodeMetadataField = 'preset' | 'type';

export type DiagramStepNodeSession = DiagramComponentNodeSession;

export type DiagramStepNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramStepNodeButtonProps {
    placement?: DiagramStepNodePlacement;
    session?: DiagramStepNodeSession;
}

function useFlowchartAvailability(session: DiagramStepNodeSession) {
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
        () => session.getMetadataFieldSnapshot('type') === 'flow' && session.getMetadataFieldSnapshot('preset') === 'flowchart',
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates step placement only for flow diagrams whose flowchart preset permits step nodes. */
export function DiagramStepNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramStepNodeButtonProps) {
    const available = useFlowchartAvailability(session);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        placement.activate(STEP_NODE_DEFINITION);
    }, [placement]);

    if (!available) return null;

    return (
        <DiagramToolboxButton
            active={activeTool === 'node:step'}
            label="Step"
            onActivate={handleActivate}
            tooltip="Place step node"
        />
    );
}
