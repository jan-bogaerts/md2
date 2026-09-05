import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramType } from '../../services/diagrams/diagram_data';
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

const COMPONENT_NODE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
    kind: 'component',
};

export interface DiagramComponentNodeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: (field: 'type') => DiagramType | null;
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: 'type', listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramComponentNodePlacement = Pick<DiagramNodePlacementService, 'activate'>;

interface DiagramComponentNodeButtonProps {
    placement?: DiagramComponentNodePlacement;
    session?: DiagramComponentNodeSession;
}

function useDiagramType(session: DiagramComponentNodeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(
        (): DiagramType | null => session.getMetadataFieldSnapshot('type'),
        [session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates component placement only for diagram types whose schema permits component nodes. */
export function DiagramComponentNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramComponentNodeButtonProps) {
    const diagramType = useDiagramType(session);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        placement.activate(COMPONENT_NODE_DEFINITION);
    }, [placement]);

    if (diagramType !== 'architecture' && diagramType !== 'dependency') return null;

    return (
        <DiagramToolboxButton
            active={activeTool === 'node:component'}
            label="Component"
            onActivate={handleActivate}
            tooltip="Place component node"
        />
    );
}
