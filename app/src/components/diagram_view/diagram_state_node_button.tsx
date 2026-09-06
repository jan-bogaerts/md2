import { useCallback, useSyncExternalStore } from 'react';
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramNodePlacementService,
    type DiagramNodePlacementDefinition,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import type { DiagramComponentNodeSession } from './diagram_component_node_button';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

const STATE_NODE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New state', role: 'focal', width: 160 },
    kind: 'state',
};

export type DiagramStateNodeSession = DiagramComponentNodeSession;

export type DiagramStateNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramStateNodeButtonProps {
    placement?: DiagramStateNodePlacement;
    session?: DiagramStateNodeSession;
}

function useStatePresetAvailability(session: DiagramStateNodeSession) {
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
        () => session.getMetadataFieldSnapshot('type') === 'flow'
            && session.getMetadataFieldSnapshot('preset') === 'state',
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates state placement only for flow diagrams using state preset. */
export function DiagramStateNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramStateNodeButtonProps) {
    const available = useStatePresetAvailability(session);
    const activeTool = useActiveDiagramTool(session, 'node:state');
    const handleActivate = useCallback(() => {
        placement.activate(STATE_NODE_DEFINITION);
    }, [placement]);

    if (!available) return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="State"
            onActivate={handleActivate}
            tooltip="Place state node"
        />
    );
}
