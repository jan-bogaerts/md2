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

const DECISION_NODE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 96, label: 'New decision', role: 'focal', width: 96 },
    kind: 'decision',
};

export type DiagramDecisionNodeSession = DiagramComponentNodeSession;

export type DiagramDecisionNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramDecisionNodeButtonProps {
    placement?: DiagramDecisionNodePlacement;
    session?: DiagramDecisionNodeSession;
}

function useDiagramType(session: DiagramDecisionNodeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeField = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeField();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(
        () => session.getMetadataFieldSnapshot('type'),
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useFlowPreset(session: DiagramDecisionNodeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeField = session.subscribeMetadataField('preset', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeField();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(
        () => session.getMetadataFieldSnapshot('preset'),
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates decision placement only for flow diagrams using flowchart preset. */
export function DiagramDecisionNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramDecisionNodeButtonProps) {
    const diagramType = useDiagramType(session);
    const preset = useFlowPreset(session);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        placement.activate(DECISION_NODE_DEFINITION);
    }, [placement]);

    if (diagramType !== 'flow' || preset !== 'flowchart') return null;

    return (
        <DiagramToolboxButton
            active={activeTool === 'node:decision'}
            label="Decision"
            onActivate={handleActivate}
            tooltip="Place decision node"
        />
    );
}
